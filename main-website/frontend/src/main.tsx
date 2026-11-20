import React, { useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import {
  Heart,
  ShoppingBag,
  UserRound,
  Menu,
  Search,
  Flower2,
} from "lucide-react";
import { Provider, useStore } from "./store";
import { Home, Shop, Detail, Panel } from "./Catalog";
import { Bag, Auth, Account, Checkout, Order } from "./Commerce";
import { money } from "../../../shared/client";
import "./style.css";
function App() {
  const s = useStore(),
    loc = useLocation();
  const bagButton = useRef<HTMLButtonElement>(null);
  const thumbnail = useRef<HTMLImageElement>(null);
  useEffect(() => { s.setFlight(null); }, [loc.key]);
  useLayoutEffect(() => {
    if (!s.flight) return;
    if (s.drawer) { s.setFlight(null); return; }
    const finish = () => { s.setFlight(null); s.open("bag"); };
    const image = thumbnail.current;
    const target = bagButton.current?.getBoundingClientRect();
    if (!image?.animate || !target) { finish(); return; }
    const dx = target.left + target.width / 2 - s.flight.x;
    const dy = target.top + target.height / 2 - s.flight.y;
    const arc = Math.min(85, Math.abs(dx) * .24);
    const animation = image.animate([
      { transform: "translate(0, 0) scale(.65)", opacity: 0 },
      { transform: "translate(0, -14px) scale(1)", opacity: 1, offset: .14 },
      { transform: `translate(${dx * .5}px, ${dy * .5 - arc}px) scale(.8)`, opacity: 1, offset: .58 },
      { transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: .15 },
    ], { duration: 540, easing: "ease-in-out", fill: "both" });
    animation.onfinish = finish;
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [s.flight, s.drawer]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  useEffect(() => { s.open(""); }, [loc.key]);
  const links = (
    <>
      <Link to="/shop">Shop all</Link>
      {s.products.some(p => p.comparePrice && p.comparePrice > p.price) && <Link to="/shop?sale=yes">Sale</Link>}
      {[...new Set(s.products.map((p) => p.collection.name))]
        .slice(0, 3)
        .map((c) => (
          <Link to={"/collection/" + encodeURIComponent(c)} key={c}>
            {c}
          </Link>
        ))}
    </>
  );
  return (
    <>
      <div className="announcement">
        Complimentary shipping on orders from {money(s.settings.freeOver)}
      </div>
      <header className="nav">
        <Link className="wordmark" to="/">
          {s.settings.name}
          
        </Link>
        <nav>{links}</nav>
        <div className="icons">
          <Link aria-label="Search shop" to="/shop">
            <Search />
          </Link>
          <Link aria-label="My account" to="/account">
            <UserRound />
          </Link>
          <Link aria-label="Wishlist" to="/wishlist">
            <Heart />
          </Link>
          <button ref={bagButton} aria-label="Open shopping bag" onClick={() => s.open("bag")}>
            <ShoppingBag />
            <span>{s.bag.reduce((n, i) => n + i.quantity, 0)}</span>
          </button>
          <button
            className="mobile"
            aria-label="Open menu"
            onClick={() => s.open("menu")}
          >
            <Menu />
          </button>
        </div>
      </header>
      {s.flight && <img ref={thumbnail} className="bag-flight" src={s.flight.photo} alt="" aria-hidden="true"
        style={{ left: s.flight.x, top: s.flight.y }} />}
      <main>
        {s.error && (
          <div role="alert" className="container">
            {s.error}{" "}
            <button
              onClick={() => s.refresh().catch((e) => s.notify(e.message))}
            >
              Retry
            </button>
          </div>
        )}
        {s.loading ? (
          <p className="container block">Opening the studio…</p>
        ) : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/collection/:name" element={<Shop />} />
            <Route path="/wishlist" element={<Shop wishlist />} />
            <Route path="/product/:slug" element={<Detail />} />
            <Route
              path="/bag"
              element={
                <section className="narrow block">
                  <h1>Shopping bag</h1>
                  <Bag />
                </section>
              }
            />
            <Route path="/login" element={<Auth />} />
            <Route path="/account" element={<Account />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders/:id" element={<Order />} />
            <Route
              path="*"
              element={
                <p className="container block">
                  Page not found. <Link to="/shop">Visit the shop</Link>
                </p>
              }
            />
          </Routes>
        )}
      </main>
      <footer>
        <Link to="/" className="wordmark">
          {s.settings.name}
        </Link>
        <span>Indian clothing studio</span>
        <Link to="/shop">Shop</Link>
        <Link to="/account">My account</Link>
      </footer>
      {s.drawer && (
        <Panel
          title={s.drawer === "bag" ? "Shopping bag" : "Menu"}
          close={() => s.open("")}
        >
          {s.drawer === "bag" ? (
            <Bag />
          ) : (
            <nav className="menu">
              {links}
              <strong>Shop by category</strong>
              {[...new Set(s.products.map(p => p.category.name))].map(category =>
                <Link key={category} to={"/shop?category=" + encodeURIComponent(category)}>{category}</Link>)}
              <Link to="/account">My account</Link>
              <Link to="/wishlist">Wishlist</Link>
            </nav>
          )}
        </Panel>
      )}
      {s.message && (
        <div className="toast" role="status">
          {s.message}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <Provider>
      <App />
    </Provider>
  </BrowserRouter>,
);
