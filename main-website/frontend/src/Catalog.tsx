import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Heart,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  ShoppingBag,
  Plus,
} from "lucide-react";
import { api, money, media, type Product } from "../../../shared/client";
import { useStore } from "./store";
export function Panel({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      className="panel"
      onCancel={close}
      onClick={(e) => {
        if (
          e.target === ref.current &&
          e.clientX < ref.current!.getBoundingClientRect().left
        )
          close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button aria-label="Close drawer" onClick={close}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const colours: Record<string, string> = {
  Sand: "#bdac90",
  Charcoal: "#464640",
  Terracotta: "#b86543",
  Forest: "#425342",
  Umber: "#735039",
  Fig: "#765564",
  Graphite: "#54565b",
  Amber: "#bd8736",
  Seafoam: "#a7c7b4",
  Ink: "#25282b",
  Chalk: "#e6e1d6",
  Clay: "#b67b65",
  Olive: "#76775d",
  Sage: "#9fa694",
  Ecru: "#ded6c2",
  Indigo: "#445778",
  Cocoa: "#765647",
  Slate: "#757e86",
  Oat: "#cdbfa2",
  Rust: "#ab694a",
  Stone: "#b1a595",
};
const occasions: Record<string, string> = {
  "City Uniform": "At work",
  "Daily Ritual": "Everyday",
  "Coastal Forms": "On holiday",
};

function discount(p: Product) {
  return p.comparePrice && p.comparePrice > p.price
    ? Math.round((1 - p.price / p.comparePrice) * 100)
    : 0;
}

export function Card({ p }: { p: Product }) {
  const s = useStore(),
    [quick, setQuick] = useState(false),
    [colour, setColour] = useState(p.picturedColour),
    saved = s.wishes.includes(p.id);
  return (
    <article className="card">
      <div className="pic">
        <Link to={"/product/" + p.slug} aria-label={p.name}>
          <img
            loading="lazy"
            src={media(p.front)}
            alt={p.name + " in " + p.picturedColour + ", front view"}
          />
          <img loading="lazy" className="back" src={media(p.back)} alt="" />
        </Link>
        <button
          className={"heart " + (saved ? "saved" : "")}
          aria-label={
            (saved ? "Remove from" : "Add to") + " wishlist: " + p.name
          }
          onClick={() => s.wish(p.id)}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
        {!!p.comparePrice && p.comparePrice > p.price && (
          <small className="badge">{discount(p)}% off</small>
        )}
        <button className="quick" aria-label={"Quick add " + p.name} onClick={() => setQuick(true)}>
          <Plus size={16} /> Quick add
        </button>
      </div>
      <div className="meta">{p.collection?.name}</div>
      <div className="cardline">
        <Link to={"/product/" + p.slug}>{p.name}</Link>
        <span>{money(p.price)} {discount(p) > 0 && <del>{money(p.comparePrice!)}</del>}</span>
      </div>
      {quick && (
        <Panel title={p.name} close={() => setQuick(false)}>
          <div className="quick-summary"><img src={media(p.front)} alt={p.picturedColour + " front view"} />
            <div><p className="meta">{p.collection.name}</p><p>{money(p.price)}</p><Link className="under" to={"/product/" + p.slug}>View piece</Link></div>
          </div>
          <label>Colour<select value={colour} onChange={(e) => setColour(e.target.value)}>
            {[...new Set(p.variants.map(v => v.colour))].map(c => <option key={c}>{c}</option>)}
          </select></label>
          <strong>Choose a size to add to bag</strong>
          <div className="tabs">{p.variants.filter(v => v.colour === colour).map(v => {
            const quantity = (s.bag.find(i => i.variantId === v.id)?.quantity || 0) + 1;
            return <button key={v.id} disabled={quantity > Math.min(v.stock, 99)} onClick={e => {
              s.addToBag(v.id, quantity, media(p.front), e.currentTarget);
              setQuick(false);
            }}>{v.size}</button>;
          })}</div>
        </Panel>
      )}
      <div className="swatches">
        {[...new Set(p.variants.map((v) => v.colour))].map((c) => (
          <span key={c}>
            <i style={{ background: colours[c] || c }} />
            {c}
          </span>
        ))}
      </div>
    </article>
  );
}
export function Home() {
  const s = useStore(),
    [tab, setTab] = useState("All");
  const picks = s.products
    .filter((p) => tab === "All" || p.category?.name === tab)
    .slice(0, 4);
  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">THE COASTAL EDIT</p>
          <h1>
            Quiet forms.
            <br />
            <em>Everyday ease.</em>
          </h1>
          <p>
            Relaxed silhouettes, natural textures, and pieces
            <br className="desk" /> that move at your pace.
          </p>
          <Link
            className="creamBtn"
            to={
              s.products.some((p) => p.collection.name === "Coastal Forms")
                ? "/collection/Coastal Forms"
                : "/shop"
            }
          >
            Explore the collection
          </Link>
        </div>
        <span className="heroCaption">
          COASTAL FORMS &nbsp; / &nbsp; SELVEDGE STUDIO
        </span>
      </section>
      <section className="container block">
        <div className="heading">
          <div>
            <p className="kicker">FRESH FROM THE STUDIO</p>
            <h2>New arrivals</h2>
          </div>
          <Link className="under" to="/shop">
            Shop all pieces
          </Link>
        </div>
        <div className="tabs">
          {["All", ...new Set(s.products.map((p) => p.category?.name))].map(
            (t) => (
              <button
                className={t === tab ? "selected" : ""}
                onClick={() => setTab(t)}
                key={t}
              >
                {t}
              </button>
            ),
          )}
        </div>
        <div className="gridCards">
          {picks.map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </section>
      <section className="container block">
        <h2>Shop by occasion</h2>
        <div className="edits">
          {[...new Set(s.products.map((p) => p.collection?.name))].map((c) => {
            const p = s.products.find((p) => p.collection.name === c)!;
            return (
              <Link key={c} to={"/collection/" + c}>
                <img loading="lazy" src={media(p.front)} alt={p.name} />
                <div className="edit-title"><small>{c}</small><h3>{occasions[c] || c}</h3></div>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="container block">
        <p className="kicker">STUDIO SELECTION</p>
        <h2>Featured pieces</h2>
        <div className="gridCards">
          {s.products.slice(-4).map((p) => (
            <Card key={p.id} p={p} />
          ))}
        </div>
      </section>
    </>
  );
}
export function Shop({ wishlist = false }: { wishlist?: boolean }) {
  const s = useStore(),
    { name } = useParams(),
    [params, set] = useSearchParams(),
    [filters, show] = useState(false);
  const val = (key: string) => params.get(key) || "",
    change = (k: string, v: string) => {
      const next = new URLSearchParams(params);
      v ? next.set(k, v) : next.delete(k);
      if (k !== "page") next.delete("page");
      set(next);
    };
  const items = s.products
    .filter(
      (p) =>
        (!wishlist || s.wishes.includes(p.id)) &&
        (!name || p.collection.name === name) &&
        (!val("sale") || discount(p) > 0) &&
        [p.name, p.category.name, p.collection.name, p.description, ...p.variants.map(v => v.colour)]
          .join(" ").toLowerCase().includes(val("q").trim().toLowerCase()) &&
        (!val("category") || p.category.name === val("category")) &&
        (!val("max") || p.price <= Number(val("max")) * 100) &&
        p.variants.some(
          (v) =>
            (!val("size") || v.size === val("size")) &&
            (!val("colour") || v.colour === val("colour")) &&
            (!val("stock") || v.stock > 0),
        ),
    )
    .sort((a, b) =>
      val("sort") === "low"
        ? a.price - b.price
        : val("sort") === "high"
          ? b.price - a.price
          : b.id - a.id,
    );
  const page = Math.max(
    1,
    Math.min(Number(val("page")) || 1, Math.ceil(items.length / 20)),
  );
  return (
    <section className="container block">
      <p className="kicker">SELVEDGE STUDIO</p>
      <h1>{wishlist ? "Your wishlist" : name || (val("sale") ? "Sale" : "Shop all pieces")}</h1>
      {name && items[0] && <div className="collection-story">
        <img src={media(items[0].detail)} alt={items[0].name + " fabric detail"} />
        <div><p>{items[0].description}</p><Link className="under" to={"/product/" + items[0].slug}>Discover {items[0].name}</Link></div>
      </div>}
      <div className="toolbar">
        <input
          aria-label="Search products"
          placeholder="Search pieces"
          value={val("q")}
          onChange={(e) => change("q", e.target.value)}
        />
        <button onClick={() => show(true)}>
          <SlidersHorizontal size={16} /> Filters
        </button>
        <select
          aria-label="Sort products"
          value={val("sort")}
          onChange={(e) => change("sort", e.target.value)}
        >
          <option value="">Newest</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
        <small>{items.length} pieces</small>
      </div>
      {filters && (
        <Panel title="Filter pieces" close={() => show(false)}>
          {(["category", "size", "colour"] as const).map((k) => (
            <label key={k}>
              {k}
              <select
                value={val(k)}
                onChange={(e) => change(k, e.target.value)}
              >
                <option value="">All</option>
                {[
                  ...new Set(
                    s.products.flatMap((p) =>
                      k === "category"
                        ? [p.category.name]
                        : p.variants.map((v) => v[k]),
                    ),
                  ),
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          ))}
          <label>
            <input type="checkbox" checked={!!val("sale")} onChange={(e) => change("sale", e.target.checked ? "yes" : "")} /> Sale only
          </label>
          <label>
            Maximum price (₹)
            <input
              type="number"
              min="0"
              value={val("max")}
              onChange={(e) => change("max", e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={!!val("stock")}
              onChange={(e) => change("stock", e.target.checked ? "yes" : "")}
            />{" "}
            In stock only
          </label>
          <button className="primary" onClick={() => show(false)}>
            Show {items.length} pieces
          </button>
          <button onClick={() => set({})}>Clear filters</button>
        </Panel>
      )}
      <div className="active-filters">
        {["q", "category", "size", "colour", "max", "stock", "sale"].filter(k => val(k)).map(k => {
          const label = k === "stock" ? "In stock" : k === "sale" ? "Sale" : k === "max" ? "Up to ₹" + val(k) : val(k);
          return <button key={k} aria-label={"Remove filter " + label} onClick={() => change(k, "")}>{label}<X size={14}/></button>;
        })}
      </div>
      <div className="gridCards">
        {items.slice((page - 1) * 20, page * 20).map((p) => (
          <Card key={p.id} p={p} />
        ))}
      </div>
      {items.length === 0 && (
        <p>
          No pieces here yet. <Link to="/shop">Browse the shop</Link>
        </p>
      )}
      {items.length > 20 && (
        <div className="tabs">
          {Array.from({ length: Math.ceil(items.length / 20) }, (_, i) => (
            <button key={i} onClick={() => change("page", String(i + 1))}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
export function Detail() {
  const { slug } = useParams(),
    s = useStore(),
    [p, load] = useState<Product>(),
    [error, fail] = useState(""),
    [index, view] = useState(0),
    [colour, pick] = useState(""),
    [size, select] = useState(""),
    [count, setCount] = useState(1),
    [guide, show] = useState(false);
  const touch = useRef(0);
  useEffect(() => {
    let alive = true;
    load(undefined);
    fail("");
    api<Product>("/products/" + slug)
      .then((x) => {
        if (alive) {
          load(x);
          pick(x.picturedColour);
          select("");
          setCount(1);
          view(0);
        }
      })
      .catch((e) => alive && fail(e.message));
    return () => {
      alive = false;
    };
  }, [slug]);
  if (!p)
    return (
      <section className="container block">{error || "Loading piece…"}</section>
    );
  const v = p.variants.find((v) => v.size === size && v.colour === colour),
    slides = [p.front, p.back, p.detail],
    labels = ["Front", "Back", "Detail"];
  const move = (d: number) => view((index + d + 3) % 3);
  const inBag = s.bag.find(item => item.variantId === v?.id)?.quantity || 0;
  const available = Math.max(0, Math.min(99, v?.stock || 0) - inBag);
  const amount = Math.min(count, Math.max(available, 1));
  return (
    <section className="container block">
      <Link className="under" to="/shop">
        Shop all pieces
      </Link>
      <div className="detail">
        <div>
          <div
            className="gallery"
            tabIndex={0}
            aria-label="Product gallery"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(1);
              if (e.key === "ArrowLeft") move(-1);
            }}
            onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              const d = e.changedTouches[0].clientX - touch.current;
              if (Math.abs(d) > 35) move(d < 0 ? 1 : -1);
            }}
          >
            <img
              key={index}
              src={media(slides[index])}
              alt={
                p.name +
                " in " +
                p.picturedColour +
                ", " +
                labels[index] +
                " view"
              }
            />
            <button aria-label="Previous image" onClick={() => move(-1)}>
              <ChevronLeft />
            </button>
            <button aria-label="Next image" onClick={() => move(1)}>
              <ChevronRight />
            </button>
          </div>
          <div className="photo-strip">
            {labels.map((l, i) => (
              <button
                className={i === index ? "selected" : ""}
                aria-pressed={i === index}
                key={l}
                onClick={() => view(i)}
              >
                <img src={media(slides[i])} alt="" />{l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="kicker">
            {p.collection.name} / {p.category.name}
          </p>
          <h1>{p.name}</h1>
          <p>
            {money(p.price)}{" "}
            {p.comparePrice && <del>{money(p.comparePrice)}</del>}
          </p>
          <p>{p.description}</p>
          <label>
            Colour · photographed in {p.picturedColour}
            <select
              value={colour}
              onChange={(e) => {
                pick(e.target.value);
                select("");
                setCount(1);
              }}
            >
              {[...new Set(p.variants.map((v) => v.colour))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="heading">
            <strong>Select size</strong>
            <button className="under" onClick={() => show(true)}>
              Size guide
            </button>
          </div>
          <div className="tabs">
            {p.variants
              .filter((v) => v.colour === colour)
              .map((v) => (
                <button
                  disabled={!v.stock}
                  className={size === v.size ? "selected" : ""}
                  key={v.id}
                  onClick={() => { select(v.size); setCount(1); }}
                >
                  {v.size}
                </button>
              ))}
          </div>
          <p>
            {v
              ? v.stock <= 3 ? "Only " + v.stock + " left" : v.stock + " in stock"
              : p.variants.some((v) => v.stock > 0 && v.colour === colour)
                ? "Choose your size"
                : "Out of stock"}
          </p>
          {v && <div className="purchase-qty"><span>Quantity</span>
            <button aria-label="Decrease quantity" disabled={amount <= 1} onClick={() => setCount(amount - 1)}>−</button>
            <output>{amount}</output>
            <button aria-label="Increase quantity" disabled={amount >= available} onClick={() => setCount(amount + 1)}>+</button>
          </div>}
          <button
            className="primary"
            disabled={!available}
            onClick={e => {
              if (v) s.addToBag(v.id, inBag + amount, media(slides[index]), e.currentTarget);
            }}
          >
            <ShoppingBag size={17} /> Add to bag
          </button>
          <button onClick={() => s.wish(p.id)}>
            <Heart size={17} />{" "}
            {s.wishes.includes(p.id) ? "Saved to wishlist" : "Save to wishlist"}
          </button>
          <details className="delivery"><summary>Delivery &amp; payment</summary>
            <p>Shipping {money(s.settings.shipping)}. Complimentary on orders from {money(s.settings.freeOver)}.</p>
            {s.settings.cod && <p>Cash on delivery available.</p>}
          </details>
        </div>
      </div>
      {guide && (
        <Panel title="Size guide" close={() => show(false)}>
          <p>
            Body measurements in centimetres. Choose the larger size between
            measurements.
          </p>
          <table>
            <thead>
              <tr>
                <th>Size</th>
                <th>Chest</th>
                <th>Waist</th>
              </tr>
            </thead>
            <tbody>
              {["S", "M", "L", "XL"].map((v, i) => (
                <tr key={v}>
                  <td>{v}</td>
                  <td>
                    {88 + i * 6}–{93 + i * 6}
                  </td>
                  <td>
                    {70 + i * 6}–{75 + i * 6}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {s.products.some(item => item.id !== p.id && item.collection.id === p.collection.id) && (
        <section className="related"><div className="heading"><h2>More from {p.collection.name}</h2>
          <Link className="under" to={"/collection/" + encodeURIComponent(p.collection.name)}>View edit</Link></div>
          <div className="gridCards">{s.products.filter(item => item.id !== p.id && item.collection.id === p.collection.id).slice(0, 4)
            .map(item => <Card key={item.id} p={item} />)}</div>
        </section>
      )}
    </section>
  );
}
