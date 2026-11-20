import { useEffect, useRef, useState, type FormEvent } from "react";
import { Smartphone } from "lucide-react";
import { api, type Customer } from "../../../shared/client";

type GoogleIdentity = {
  initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
  renderButton: (element: HTMLElement, options: Record<string, string>) => void;
};
declare global {
  interface Window { google?: { accounts: { id: GoogleIdentity } } }
}
let sdk: Promise<GoogleIdentity> | undefined;
function loadGoogle() {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (!sdk) sdk = new Promise<GoogleIdentity>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => window.google?.accounts.id
      ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in could not load."));
    script.onerror = () => reject(new Error("Google sign-in could not load."));
    document.head.appendChild(script);
  }).catch(error => { sdk = undefined; throw error; });
  return sdk;
}
export function CustomerMethods({ signed }: { signed: (user: Customer) => Promise<void> }) {
  const [options, configure] = useState<{ mobile: boolean; googleClientId: string }>();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, wait] = useState(false);
  const [error, fail] = useState("");
  const [seconds, countdown] = useState(0);
  const googleButton = useRef<HTMLDivElement>(null);
  const onSigned = useRef(signed);
  onSigned.current = signed;
  useEffect(() => {
    let active = true;
    api("/auth/options").then(result => active && configure(result)).catch(() => active && fail("Unable to load sign-in options. Refresh to retry."));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!options?.googleClientId) return;
    let active = true;
    loadGoogle().then(id => {
      if (!active || !googleButton.current) return;
      id.initialize({ client_id: options.googleClientId, callback: async ({credential}) => {
        if (!active) return;
        fail("");
        wait(true);
        try { await onSigned.current(await api<Customer>("/auth/google", "POST", { credential })); }
        catch (e: any) { fail(e.message); }
        finally { wait(false); }
      } });
      id.renderButton(googleButton.current, { theme: "outline", size: "large", text: "continue_with" });
    }).catch(e => active && fail(e.message));
    return () => { active = false; };
  }, [options?.googleClientId]);
  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => countdown(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);
  async function submit(resend = false) {
    fail(""); wait(true);
    try {
      if (!sent || resend) {
        await api("/auth/mobile/send", "POST", { phone });
        setSent(true); setCode(""); countdown(30);
      } else {
        await signed(await api<Customer>("/auth/mobile/verify", "POST", { phone, code }));
      }
    } catch (e: any) { fail(e.message); }
    finally { wait(false); }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void submit(); }
  return <div className="customer-methods">
    <form onSubmit={onSubmit}>
      <label>Mobile number<div className="mobile-input"><span>+91</span>
        <input type="tel" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10}
          value={phone} readOnly={sent} onChange={e => setPhone(e.target.value)} placeholder="10-digit mobile number" />
      </div></label>
      {sent && <>
        <p role="status">Enter the code sent to +91 {phone}.</p>
        <label>Verification code<input required autoFocus inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{4,10}" maxLength={10} value={code} onChange={e => setCode(e.target.value)} /></label>
      </>}
      <button className="primary" disabled={busy || !options?.mobile}><Smartphone size={17}/>
        {busy ? "Please wait…" : sent ? "Verify and continue" : "Send OTP"}</button>
      {options && !options.mobile && <small>SMS sign-in is currently unavailable.</small>}
      {sent && <div><button type="button" disabled={busy || seconds > 0} onClick={() => submit(true)}>
        {seconds ? "Resend in " + seconds + "s" : "Resend code"}</button>
        <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(""); fail(""); }}>Change number</button></div>}
    </form>
    <div ref={googleButton} />
    {options && !options.googleClientId && <button className="google-unavailable" disabled>Continue with Google · Unavailable</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
