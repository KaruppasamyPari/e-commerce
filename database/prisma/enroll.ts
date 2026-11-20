import {randomBytes,createHash} from 'node:crypto';import {db} from '../../shared/config';
try{const email=(process.argv[2]||process.env.ADMIN_EMAIL||'').trim().toLowerCase();const code=randomBytes(24).toString('base64url');
const issued=await db.account.updateMany({where:{email,role:'admin',mfaSecret:null},data:{enrollmentHash:createHash('sha256').update(code).digest('hex'),enrollmentExpiry:new Date(Date.now()+15*60000),authVersion:{increment:1}}});
if(!issued.count)throw Error('No unenrolled staff account with that email');
console.log('Deliver this 15-minute enrolment code privately to the verified staff member:\n'+code);
}finally{await db.$disconnect()}