import {createHmac,randomBytes,createCipheriv,createDecipheriv,createHash,timingSafeEqual} from 'node:crypto';
import type {Account} from '@prisma/client';
import {db} from './config';
import {check} from './http';
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export function encryptionKey(){
 const key=Buffer.from(process.env.MFA_ENCRYPTION_KEY||'','base64');if(key.length!==32)throw Error('Configure a 32-byte base64 MFA_ENCRYPTION_KEY');return key;
}
function encrypt(raw:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);const data=Buffer.concat([cipher.update(raw),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64')}
function decrypt(value:string){const b=Buffer.from(value,'base64');const cipher=createDecipheriv('aes-256-gcm',encryptionKey(),b.subarray(0,12));cipher.setAuthTag(b.subarray(12,28));return Buffer.concat([cipher.update(b.subarray(28)),cipher.final()])}
export function base32(key:Buffer){const bits=Array.from(key,b=>b.toString(2).padStart(8,'0')).join('');return (bits.match(/.{1,5}/g)||[]).map(s=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(s.padEnd(5,'0'),2)]).join('')}
function validStep(secret:string,code:string,last:number){
 if(!/^\d{6}$/.test(code))return -1;
 const now=Math.floor(Date.now()/30000),key=decrypt(secret);
 for(const step of [now,now-1,now+1]){if(step<=last)continue;const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',key).update(counter).digest();const n=(h.readUInt32BE(h[19]&15)&0x7fffffff)%1000000;
 if(timingSafeEqual(Buffer.from(String(n).padStart(6,'0')),Buffer.from(code)))return step;}return -1;
}
export async function begin(user:Account,ticket:unknown){
 let setupKey:string|undefined,secret:string|null=null;
 if(!user.mfaSecret){
 check(typeof ticket==='string'&&ticket.length<=128&&user.enrollmentHash===digest(ticket)&&user.enrollmentExpiry&&user.enrollmentExpiry>new Date(),403,'Enter the one-time enrolment code supplied by your store operator.');
 const raw=randomBytes(20);setupKey=base32(raw);secret=encrypt(raw);
 }
 const challenge=randomBytes(32).toString('hex');await db.mfaChallenge.deleteMany({where:{expires:{lt:new Date()}}});
 await db.mfaChallenge.create({data:{token:digest(challenge),accountId:user.id,expires:new Date(Date.now()+300000),secret,authVersion:user.authVersion}});
 return {challenge,setupKey};
}
export async function complete(challenge:string,code:string,oldToken:string,expires:Date){
 const token=digest(challenge),now=new Date();
 // Charge the attempt outside the success transaction so a rejected code consumes budget.
 const charged=await db.mfaChallenge.updateMany({where:{token,expires:{gt:now},attempts:{lt:5}},data:{attempts:{increment:1}}});check(charged.count,401,'Challenge expired. Sign in again.');
 return db.$transaction(async tx=>{
 const found=await tx.mfaChallenge.findUniqueOrThrow({where:{token}});
 await tx.$queryRaw`SELECT id FROM Account WHERE id=${found.accountId} FOR UPDATE`;
 const user=await tx.account.findUniqueOrThrow({where:{id:found.accountId}});
 check(user.role==='admin'&&user.authVersion===found.authVersion&&found.expires>new Date(),401,'Sign in again');
 const secret=found.secret||user.mfaSecret;check(secret&&(!found.secret||(!user.mfaSecret&&user.enrollmentExpiry&&user.enrollmentExpiry>new Date())),401,'Enrolment expired');
 const step=validStep(secret,code,user.lastStep);let recoveryCodes:string[]|undefined;
 if(step<0){check(!found.secret&&/^([a-f0-9]{8}-){3}[a-f0-9]{8}$/i.test(code),401,'Invalid or previously used code');
 const used=await tx.recoveryCode.deleteMany({where:{accountId:user.id,digest:digest(code.toLowerCase())}});check(used.count,401,'Invalid or previously used code');}
 else await tx.account.update({where:{id:user.id},data:{lastStep:step}});
 if(found.secret){recoveryCodes=Array.from({length:8},()=>randomBytes(16).toString('hex').match(/.{8}/g)!.join('-'));
 await tx.account.update({where:{id:user.id},data:{mfaSecret:secret,enrollmentHash:null,enrollmentExpiry:null}});
 await tx.recoveryCode.createMany({data:recoveryCodes.map(c=>({accountId:user.id,digest:digest(c)}))});}
 const consumed=await tx.mfaChallenge.deleteMany({where:{token}});check(consumed.count,401,'Challenge already used');
 await tx.session.deleteMany({where:{token:digest(oldToken)}});
 const session=randomBytes(32).toString('hex');await tx.session.create({data:{token:digest(session),verified:true,authVersion:user.authVersion,expires,accountId:user.id}});
 return {session,user:{id:user.id,email:user.email,name:user.name,staffRole:user.staffRole},recoveryCodes};
 });
}