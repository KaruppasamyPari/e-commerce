import { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  Link,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  LayoutDashboard,
  Shirt,
  Boxes,
  ClipboardList,
  Users,
  Settings,
  Layers,
  LogOut,
} from "lucide-react";
import { api, money } from "../../../shared/client";
import { Products, Editor } from "./Products";
import { useData, Pending, Table, OrderTable } from "./helpers";
import "./style.css";
function Dashboard() {
  const { data, error } = useData("/dashboard");
  if (!data) return <Pending error={error} />;
  return (
    <>
      <p className="eyebrow">STUDIO OPERATIONS</p>
      <h1>Overview</h1>
      <div className="metrics">
        {[
          ["Total orders", data.orders, "/orders"],
          ["Confirmed sales", money(data.sales), "/orders"],
          ["Low-stock variants", data.low, "/inventory?low=1"],
          ["Published products", data.published, "/products"],
        ].map(([k, v, url]) => (
          <Link key={k} to={url}>
            <small>{k}</small>
            <strong>{v}</strong>
          </Link>
        ))}
      </div>
      <div className="box">
        <h2>Recent orders</h2>
        <OrderTable orders={data.recent} />
      </div>
    </>
  );
}
function Inventory() {
  const { data, error } = useData("/inventory"),
    [q, set] = useState(""),
    [params, filter] = useSearchParams();
  return (
    <>
      <h1>Inventory</h1>
      <div className="tools">
        <input
          aria-label="Search SKU"
          placeholder="Search SKU or product"
          value={q}
          onChange={(e) => set(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={params.has("low")}
            onChange={(e) => filter(e.target.checked ? { low: "1" } : {})}
          />{" "}
          Low stock only (≤3)
        </label>
      </div>
      {data ? (
        <Table
          heads={["SKU", "Product", "Variant", "Available"]}
          rows={data
            .filter(
              (v: any) =>
                (!params.has("low") || v.stock <= 3) &&
                (v.sku + v.product.name)
                  .toLowerCase()
                  .includes(q.toLowerCase()),
            )
            .map((v: any) => [
              v.sku,
              <Link to={"/products/" + v.productId}>{v.product.name}</Link>,
              v.colour + " / " + v.size,
              v.stock <= 3 ? (
                <strong className="low">{v.stock} · Low</strong>
              ) : (
                v.stock
              ),
            ])}
        />
      ) : (
        <Pending error={error} />
      )}
    </>
  );
}
function Orders() {
  const { data, error } = useData("/orders"),
    [params] = useSearchParams(),
    [status, set] = useState("");
  return (
    <>
      <h1>{params.has("customer") ? "Customer order history" : "Orders"}</h1>
      <div className="tools">
        <select
          aria-label="Order status"
          value={status}
          onChange={(e) => set(e.target.value)}
        >
          <option value="">All statuses</option>
          {[
            "Placed",
            "Confirmed",
            "Packed",
            "Shipped",
            "Delivered",
            "Cancelled",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>
      {data ? (
        <OrderTable
          orders={data.filter(
            (o: any) =>
              (!status || o.status === status) &&
              (!params.has("customer") ||
                o.accountId === Number(params.get("customer"))),
          )}
        />
      ) : (
        <Pending error={error} />
      )}
    </>
  );
}
function Order() {
  const { id } = useParams(),
    { data: o, set, error, fail } = useData("/orders/" + id),
    [saved, msg] = useState("");
  if (!o) return <Pending error={error} />;
  const stages = ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      set(
        await api(
          "/orders/" + id,
          "PUT",
          Object.fromEntries(new FormData(e.currentTarget)),
        ),
      );
      fail("");
      msg("Order updated");
    } catch (e: any) {
      fail(e.message);
    }
  }
  return (
    <>
      <Link to="/orders">All orders</Link>
      <h1>Order #{o.id}</h1>
      <div className="box">
        <h2>Delivery</h2>
        <p>{Object.values(o.address).join(" · ")}</p>
        <p>{o.account?.email}</p>
        <Table
          heads={["Piece", "SKU", "Variant", "Quantity", "Unit price"]}
          rows={o.items.map((i: any) => [
            i.name,
            i.sku,
            i.colour + " / " + i.size,
            i.quantity,
            money(i.price),
          ])}
        />
        <p>
          Shipping {money(o.shipping)} · Total {money(o.total)}
        </p>
      </div>
      <form key={o.status} className="box" onSubmit={submit}>
        <h2>Manual fulfilment</h2>
        <p>
          Payment · {o.payment} &nbsp; Shipment · {o.shipment}
        </p>
        <label>
          Order status
          <select name="status" defaultValue={o.status}>
            {[
              o.status,
              ...(stages.includes(o.status)
                ? stages.slice(
                    stages.indexOf(o.status) + 1,
                    stages.indexOf(o.status) + 2,
                  )
                : []),
              ...(["Placed", "Confirmed", "Packed"].includes(o.status)
                ? ["Cancelled"]
                : []),
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {["courier", "tracking", "notes"].map((k) => (
          <label key={k}>
            {k === "tracking"
              ? "Tracking reference"
              : k === "notes"
                ? "Internal notes"
                : "Courier name"}
            <input name={k} defaultValue={o[k]} />
          </label>
        ))}
        <button className="primary">Save order</button>
      </form>
      {o.status === "Delivered" && o.payment !== "Paid" && (
        <button
          onClick={async () => {
            try {
              await api("/orders/" + id + "/collect", "POST");
              set({ ...o, payment: "Paid" });
              msg("Collection recorded");
            } catch (e: any) {
              fail(e.message);
            }
          }}
        >
          Record cash collection
        </button>
      )}
      <p role="alert">{error}</p>
      <p role="status">{saved}</p>
    </>
  );
}
function Customers() {
  const { data, error } = useData("/customers");
  return (
    <>
      <h1>Customers</h1>
      {data ? (
        <Table
          heads={["Name", "Email", "Orders"]}
          rows={data.map((c: any) => [
            c.name,
            c.email,
            <Link to={"/orders?customer=" + c.id}>
              {c._count.orders} · View history
            </Link>,
          ])}
        />
      ) : (
        <Pending error={error} />
      )}
    </>
  );
}
function Taxonomy() {
  const { data, error, reload, fail } = useData("/taxonomy");
  async function save(
    e: FormEvent<HTMLFormElement>,
    kind: string,
    id?: number,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      await api("/taxonomy/" + kind, "POST", {
        id,
        name: new FormData(form).get("name"),
      });
      reload();
    } catch (e: any) {
      fail(e.message);
    }
  }
  return (
    <>
      <h1>Categories & collections</h1>
      <p role="alert">{error}</p>
      {data &&
        ["categories", "collections"].map((k) => (
          <section key={k} className="box">
            <h2>{k}</h2>
            {data[k].map((x: any) => (
              <form
                className="tools"
                key={x.id}
                onSubmit={(e) => save(e, k, x.id)}
              >
                <input
                  name="name"
                  aria-label={"Rename " + x.name}
                  defaultValue={x.name}
                  required
                />
                <button>Rename</button>
              </form>
            ))}
            <form className="tools" onSubmit={(e) => save(e, k)}>
              <input
                aria-label={"New " + k}
                placeholder="New name"
                name="name"
                required
              />
              <button>Add</button>
            </form>
          </section>
        ))}
    </>
  );
}
function StoreSettings() {
  const { data: s, error, set, fail } = useData("/settings"),
    [ok, msg] = useState("");
  if (!s) return <Pending error={error} />;
  return (
    <>
      <h1>Store settings</h1>
      <form
        className="box"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            set(
              await api("/settings", "PUT", {
                name: f.get("name"),
                brandColour: f.get("brandColour"),
                currency: "INR",
                shipping: Math.round(Number(f.get("shipping")) * 100),
                freeOver: Math.round(Number(f.get("freeOver")) * 100),
                cod: f.has("cod"),
              }),
            );
            msg("Settings saved");
            fail("");
          } catch (e: any) {
            fail(e.message);
          }
        }}
      >
        <label>
          Store name
          <input name="name" defaultValue={s.name} required />
        </label>
        <label>
          Brand colour
          <input type="color" name="brandColour" defaultValue={s.brandColour} />
        </label>
        <label>
          Currency
          <select>
            <option>INR</option>
          </select>
        </label>
        {["shipping", "freeOver"].map((k) => (
          <label key={k}>
            {k === "shipping" ? "Shipping fee" : "Free shipping threshold"} (₹)
            <input
              type="number"
              min="0"
              step=".01"
              name={k}
              defaultValue={s[k] / 100}
              required
            />
          </label>
        ))}
        <label>
          <input type="checkbox" name="cod" defaultChecked={s.cod} /> Enable
          Cash on Delivery
        </label>
        <button className="primary">Save settings</button>
        <p role="alert">{error}</p>
        <p role="status">{ok}</p>
      </form>
    </>
  );
}
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/products", "Products", Shirt],
  ["/inventory", "Inventory", Boxes],
  ["/taxonomy", "Categories & collections", Layers],
  ["/orders", "Orders", ClipboardList],
  ["/customers", "Customers", Users],
  ["/settings", "Store settings", Settings],
] as const;
function App() {
  const [user, set] = useState<any>(undefined),
    [err, fail] = useState("");
  useEffect(() => {
    api("/me")
      .then(set)
      .catch((e) => {
        if (e.status !== 401) fail(e.message);
        set(null);
      });
  }, []);
  if (user === undefined) return <Pending error="" />;
  if (!user)
    return (
      <main className="login">
        <p className="eyebrow">SELVEDGE / STUDIO</p>
        <h1>Staff sign in</h1>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              set(
                await api(
                  "/login",
                  "POST",
                  Object.fromEntries(new FormData(e.currentTarget)),
                ),
              );
              fail("");
            } catch (e: any) {
              fail(e.message);
            }
          }}
        >
          <label>
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary">Sign in</button>
          <p role="alert">{err}</p>
        </form>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <Link to="/" className="brand">
          Selvedge
        </Link>
        <p className="eyebrow">STORE MANAGEMENT</p>
        <nav>
          {nav.map(([url, name, Icon]) => (
            <NavLink key={url} end={url === "/"} to={url}>
              <Icon size={18} />
              {name}
            </NavLink>
          ))}
        </nav>
        <button
          onClick={async () => {
            try {
              await api("/logout", "POST");
              set(null);
            } catch (e: any) {
              fail(e.message);
            }
          }}
        >
          <LogOut size={17} /> Sign out
        </button>
      </aside>
      <main>
        <header>
          Studio dashboard <span>{user.name}</span>
        </header>
        <article>
          {err && <p role="alert">{err}</p>}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<Editor />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<Order />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/taxonomy" element={<Taxonomy />} />
            <Route path="/settings" element={<StoreSettings />} />
            <Route path="*" element={<p>Page not found.</p>} />
          </Routes>
        </article>
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
