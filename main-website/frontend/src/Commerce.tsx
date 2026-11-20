import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { Minus, Plus, Trash2, Check, Package, Truck, MapPin, X } from "lucide-react";
import { api, money, media, type Customer } from "../../../shared/client";
import { useStore } from "./store";
import { CustomerMethods } from "./CustomerMethods";
export function Bag() {
  const s = useStore();
  let total = 0;
  return (
    <div className="bag">
      {!s.bag.length && (
        <>
          <p>Your bag is empty.</p>
          <Link className="primary" to="/shop" onClick={() => s.open("")}>
            Explore the shop
          </Link>
        </>
      )}
      {s.bag.map((item) => {
        const p = s.products.find((p) =>
            p.variants.some((v) => v.id === item.variantId),
          ),
          v = p?.variants.find((v) => v.id === item.variantId);
        if (p) total += p.price * item.quantity;
        return (
          <div className="bagitem" key={item.variantId}>
            {p && <img src={media(p.front)} alt={p.name} />}
            <div>
              <strong>{p?.name || "Unavailable piece"}</strong>
              <p>
                {v?.colour} / {v?.size} {p && money(p.price)}
              </p>
              {(!v || v.stock < item.quantity) && (
                <p role="alert">Unavailable in this quantity</p>
              )}
              <div className="qty">
                <button
                  aria-label="Decrease quantity"
                  onClick={() => s.quantity(item.variantId, item.quantity - 1)}
                >
                  <Minus size={14} />
                </button>
                {item.quantity}
                <button
                  aria-label="Increase quantity"
                  onClick={() => s.quantity(item.variantId, item.quantity + 1)}
                >
                  <Plus size={14} />
                </button>
                <button
                  aria-label="Remove item"
                  onClick={() => s.quantity(item.variantId, 0)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {s.bag.length > 0 && (
        <>
          <p className="split">
            <strong>Subtotal</strong>
            {money(total)}
          </p>
          <small>Shipping calculated at checkout.</small>
          <Link className="primary" to="/checkout" onClick={() => s.open("")}>
            Continue to checkout
          </Link>
          {s.drawer === "bag" && (
            <Link className="under" to="/bag" onClick={() => s.open("")}>
              View shopping bag
            </Link>
          )}
        </>
      )}
    </div>
  );
}
export function Auth() {
  const s = useStore(),
    go = useNavigate(),
    location = useLocation(),
    [register, toggle] = useState(false),
    [err, fail] = useState(""),
    [busy, wait] = useState(false);
  async function finish(user: Customer) {
    await s.signed(user);
    go(new URLSearchParams(location.search).get("next") === "checkout" ? "/checkout" : "/account");
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    wait(true);
    fail("");
    try {
      const u = await api<Customer>(
        register ? "/register" : "/login",
        "POST",
        b,
      );
      await finish(u);
    } catch (e: any) {
      fail(e.message);
    } finally {
      wait(false);
    }
  }
  return (
    <section className="narrow block customer-auth">
      <p className="kicker">YOUR ACCOUNT</p>
      <h1>{register ? "Create an account" : "Welcome back"}</h1>
      <CustomerMethods signed={finish}/>
      <p className="auth-divider">or continue with email</p>
      <form onSubmit={submit}>
        {register && (
          <label>
            Name
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            required
            minLength={register ? 10 : 1}
            autoComplete={register ? "new-password" : "current-password"}
          />
        </label>
        <p role="alert">{err}</p>
        <button disabled={busy} className="primary">
          {register ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        className="under"
        onClick={() => {
          toggle(!register);
          fail("");
        }}
      >
        {register
          ? "Already registered? Sign in"
          : "New here? Create an account"}
      </button>
    </section>
  );
}
const fields = [
  ["recipient", "Full name", "name"],
  ["phone", "Mobile number", "tel-national"],
  ["line1", "House, street and locality", "street-address"],
  ["city", "City", "address-level2"],
  ["state", "State or union territory", "address-level1"],
  ["pin", "PIN code", "postal-code"],
];
function AddressForm({ saved }: { saved: (a: any) => void }) {
  const [err, fail] = useState(""),
    [busy, wait] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    wait(true);
    try {
      const a = await api(
        "/addresses",
        "POST",
        Object.fromEntries(new FormData(form)),
      );
      form.reset();
      saved(a);
      fail("");
    } catch (e: any) {
      fail(e.message);
    } finally {
      wait(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <h3>Add a delivery address</h3>
      {fields.map(([n, l, a]) => (
        <label key={n}>
          {l}
          <input
            name={n}
            autoComplete={a}
            required
            pattern={n === "pin" ? "[1-9][0-9]{5}" : undefined}
            inputMode={n === "pin" ? "numeric" : n === "phone" ? "tel" : "text"}
          />
        </label>
      ))}
      <p role="alert">{err}</p>
      <button disabled={busy}>Save address</button>
    </form>
  );
}
function addressText(a: any) {
  return [a.recipient, a.line1, a.city, a.state, a.pin, a.phone].join(", ");
}
export function Account() {
  const s = useStore(),
    [addresses, set] = useState<any[]>([]),
    [orders, list] = useState<any[]>([]),
    [err, fail] = useState("");
  useEffect(() => {
    if (s.user)
      Promise.all([api("/addresses"), api("/orders")])
        .then(([a, o]) => {
          set(a);
          list(o);
        })
        .catch((e) => fail(e.message));
  }, [s.user]);
  if (!s.user) return <Auth />;
  return (
    <section className="container block">
      <p className="kicker">MY ACCOUNT</p>
      <div className="heading">
        <h1>{s.user.name}</h1>
        <button onClick={() => s.logout().catch((e) => fail(e.message))}>
          Sign out
        </button>
      </div>
      <p>{s.user.email || s.user.phone}</p>
      <p role="alert">{err}</p>
      <div className="columns">
        <div>
          <h2>Order history</h2>
          {!orders.length && <p>You haven’t placed an order yet.</p>}
          {orders.map((o) => (
            <Link className="row" key={o.id} to={"/orders/" + o.id}>
              Order #{o.id} · {o.status} · {money(o.total)}
            </Link>
          ))}
        </div>
        <div>
          <h2>Address book</h2>
          {addresses.map((a) => (
            <div className="row" key={a.id}>
              {addressText(a)}{" "}
              <button
                aria-label="Remove address"
                onClick={async () => {
                  try {
                    await api("/addresses/" + a.id, "DELETE");
                    set(addresses.filter((x) => x.id !== a.id));
                  } catch (e: any) {
                    fail(e.message);
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <AddressForm saved={(a) => set([a, ...addresses])} />
        </div>
      </div>
    </section>
  );
}
export function Checkout() {
  const s = useStore(),
    go = useNavigate(),
    [addresses, set] = useState<any[]>([]),
    [aid, pick] = useState(0),
    [showForm, form] = useState(false),
    [q, quote] = useState<any>(null),
    [err, fail] = useState(""),
    [busy, wait] = useState(false);
  useEffect(() => {
    if (s.user)
      api("/addresses")
        .then((a) => {
          set(a);
          pick(a[0]?.id || 0);
        })
        .catch((e) => fail(e.message));
  }, [s.user]);
  async function refresh() {
    quote(null);
    if (s.bag.length) quote(await api("/cart/quote", "POST", { items: s.bag }));
  }
  useEffect(() => {
    refresh().catch((e) => fail(e.message));
  }, [s.bag]);
  async function place() {
    wait(true);
    fail("");
    try {
      await s.flush();
      const signature = JSON.stringify([s.user?.id, aid, q.items, q.total]);
      let attempt = JSON.parse(sessionStorage.getItem("sv-checkout") || "null");
      if (attempt?.signature !== signature) {
        attempt = { key: crypto.randomUUID(), signature };
        sessionStorage.setItem("sv-checkout", JSON.stringify(attempt));
      }
      const o = await api("/orders", "POST", {
        addressId: aid,
        items: q.items,
        total: q.total,
        key: attempt.key,
      });
      s.clear();
      sessionStorage.removeItem("sv-checkout");
      go("/orders/" + o.id + "?placed=1");
      s.refresh().catch((e) => s.notify(e.message));
    } catch (e: any) {
      fail(e.message);
      if (e.status === 409) await refresh().catch((x) => fail(x.message));
    } finally {
      wait(false);
    }
  }
  if (!s.user)
    return (
      <section className="narrow block">
        <h1>Checkout</h1>
        <p>Sign in to choose a delivery address. Your bag will be saved.</p>
        <Link className="primary" to="/login?next=checkout">
          Sign in to checkout
        </Link>
      </section>
    );
  if (!s.bag.length)
    return (
      <section className="narrow block">
        <Bag />
      </section>
    );
  return (
    <section className="container block">
      <p className="kicker">CASH ON DELIVERY</p>
      <h1>Checkout</h1>
      <div className="columns">
        <div>
          <h2>Delivery address</h2>
          {addresses.map((a) => (
            <label className="choice" key={a.id}>
              <input
                type="radio"
                name="address"
                checked={aid === a.id}
                onChange={() => pick(a.id)}
              />
              {addressText(a)}
            </label>
          ))}
          {!!addresses.length && (
            <button onClick={() => form(!showForm)}>Add another address</button>
          )}
          {(!addresses.length || showForm) && (
            <AddressForm
              saved={(a) => {
                set([a, ...addresses]);
                pick(a.id);
                form(false);
              }}
            />
          )}
        </div>
        <aside className="summary">
          <h2>Order summary</h2>
          {q && (
            <>
              {q.items.map((i: any) => (
                <p className="split" key={i.variantId}>
                  <span>
                    {i.name} · {i.size} × {i.quantity}
                  </span>
                  {money(i.price * i.quantity)}
                </p>
              ))}
              <p className="split">
                Shipping <span>{q.shipping ? money(q.shipping) : "Free"}</span>
              </p>
              <p className="split">
                <strong>Total</strong>
                {money(q.total)}
              </p>
            </>
          )}
          <p>
            {q?.cod
              ? "Pay on delivery."
              : q
                ? "Cash on Delivery is unavailable."
                : "Checking availability…"}
          </p>
          <p role="alert">{err}</p>
          <button
            className="primary"
            disabled={busy || !aid || !q?.cod}
            onClick={place}
          >
            {busy ? "Placing order…" : "Place COD order"}
          </button>
          <Link className="under" to="/bag">
            Edit bag
          </Link>
        </aside>
      </div>
    </section>
  );
}
export function Order() {
  const { id } = useParams();
  const { products } = useStore();
  const [o, set] = useState<any>();
  const [err, fail] = useState("");
  const loc = useLocation();
  useEffect(() => {
    let active = true;
    set(undefined);
    fail("");
    api("/orders/" + id)
      .then(order => active && set(order))
      .catch(e => active && fail(e.message));
    return () => { active = false; };
  }, [id]);
  if (!o) return <p className="container block">{err || "Loading order…"}</p>;
  const steps = ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
  const stage = steps.indexOf(o.status);
  const cancelled = o.status === "Cancelled";
  const a = o.address;
  return (
    <section className="order-page">
      <Link className="order-back" to="/account">My account</Link>
      <header className="receipt-head">
        <div>
          <p className="kicker">{loc.search.includes("placed") ? "Order received · Cash on delivery" : "Order details"}</p>
          <h1>Order #{o.id}</h1>
          <p>Placed on <time dateTime={o.created}>{new Date(o.created).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</time></p>
        </div>
        <div className="receipt-amount"><small>Order total</small><strong>{money(o.total)}</strong></div>
      </header>
      <section className="order-tracking">
        <div className="tracking-heading"><h2>Order progress</h2>
          <span className={cancelled ? "order-status cancelled" : "order-status"}>{cancelled ? <X size={15}/> : <Package size={16}/>} {o.status}</span>
        </div>
        {cancelled ? <p>This order was cancelled.</p> : (
          <ol className="order-steps" aria-label="Order progress">
            {steps.map((step, i) => <li key={step} aria-current={i === stage ? "step" : undefined} className={i < stage ? "complete" : i === stage ? "current" : ""}>
              <span className="step-marker" aria-hidden="true">{i < stage ? <Check size={15}/> : i === stage ? <span/> : null}</span>
              {step}<span className="sr-only">{i < stage ? ", completed" : i > stage ? ", upcoming" : ""}</span>
            </li>)}
          </ol>
        )}
      </section>
      <div className="receipt-grid">
        <section className="receipt-card"><h2>Order summary</h2>
          {o.items.map((i: any) => {
            const product = products.find(p => p.variants.some(v => v.id === i.variantId));
            return <div className="receipt-item" key={i.id}>
              {product ? <img src={media(product.front)} alt="" /> : <span className="receipt-placeholder"><Package aria-hidden="true"/></span>}
              <div><strong>{i.name}</strong><small>{i.colour} / {i.size} · Qty {i.quantity}</small></div>
              <span>{money(i.price * i.quantity)}</span>
            </div>;
          })}
          <dl className="receipt-totals"><div><dt>Subtotal</dt><dd>{money(o.subtotal)}</dd></div>
            <div><dt>Shipping</dt><dd>{money(o.shipping)}</dd></div>
            <div><dt>Total</dt><dd>{money(o.total)}</dd></div></dl>
        </section>
        <aside className="receipt-card delivery-card">
          <h2><Truck size={21}/> Delivery details</h2>
          <dl className="delivery-facts">{[["Payment", o.payment], ["Shipment", o.shipment], ["Courier", o.courier], ["Tracking number", o.tracking]].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <h3><MapPin size={18}/> Delivery address</h3>
          <address><strong>{a.recipient}</strong><br/>{[a.line1, a.line2].filter(Boolean).join(", ")}<br/>{[a.city, a.state, a.pin].filter(Boolean).join(", ")}<br/>{a.phone}</address>
        </aside>
      </div>
    </section>
  );
}
