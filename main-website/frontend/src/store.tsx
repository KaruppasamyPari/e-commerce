import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  api,
  type Product,
  type BagItem,
  type Customer,
  type Settings,
} from "../../../shared/client";
const initial = {
  name: "Selvedge",
  brandColour: "#394134",
  shipping: 9900,
  freeOver: 299900,
  cod: true,
};
function local<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem("sv-" + key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function useModel() {
  const [products, setProducts] = useState<Product[]>([]),
    [settings, setSettings] = useState<Settings>(initial),
    [user, setUser] = useState<Customer | null>(null),
    [loading, load] = useState(true),
    [error, fail] = useState(""),
    [drawer, open] = useState(""),
    [message, notify] = useState("");
  const [bag, setBag] = useState<BagItem[]>(() => local("bag", [])),
    [wishes, setWishes] = useState<number[]>(() => local("wishes", []));
  const pending = useRef(Promise.resolve());
  const [flight, setFlight] = useState<{ photo: string; x: number; y: number } | null>(null);
  async function refresh() {
    const [p, s] = await Promise.all([
      api<Product[]>("/products"),
      api<Settings>("/settings"),
    ]);
    setProducts(p);
    setSettings(s);
    fail("");
    document.documentElement.style.setProperty("--accent", s.brandColour);
  }
  useEffect(() => {
    Promise.all([
      refresh(),
      api<Customer>("/me")
        .then(async (u) => {
          const b = await api("/bag");
          setUser(u);
          setBag(b.cart || []);
          setWishes(b.wishlist || []);
        })
        .catch((e) => {
          if (e.status !== 401) throw e;
        }),
    ])
      .catch((e) => fail(e.message))
      .finally(() => load(false));
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => notify(""), 3800);
    return () => clearTimeout(t);
  }, [message]);
  function persist(cart: BagItem[], wishlist: number[], who = user) {
    setBag(cart);
    setWishes(wishlist);
    if (who) {
      pending.current = pending.current
        .then(() => api("/bag", "PUT", { cart, wishlist }))
        .then(() => {})
        .catch((e) => {
          notify(e.message);
        });
    } else {
      localStorage.setItem("sv-bag", JSON.stringify(cart));
      localStorage.setItem("sv-wishes", JSON.stringify(wishlist));
    }
  }
  async function signed(u: Customer) {
    const saved = await api("/bag"),
      merged: BagItem[] = [...(saved.cart || [])];
    for (const item of bag) {
      const match = merged.find((i) => i.variantId === item.variantId);
      if (match) match.quantity = Math.min(99, match.quantity + item.quantity);
      else merged.push(item);
    }
    setUser(u);
    persist(
      merged,
      [...new Set<number>([...(saved.wishlist || []), ...wishes])],
      u,
    );
    await pending.current;
    localStorage.removeItem("sv-bag");
    localStorage.removeItem("sv-wishes");
  }
  async function logout() {
    await pending.current;
    await api("/logout", "POST");
    setUser(null);
    persist([], [], null);
  }
  function quantity(variantId: number, n: number) {
    const v = products
      .flatMap((p) => p.variants)
      .find((v) => v.id === variantId);
    if (n > 0 && (!v || n > Math.min(v.stock, 99))) {
      notify("That quantity is unavailable");
      return false;
    }
    persist(
      [
        ...bag.filter((i) => i.variantId !== variantId),
        ...(n > 0 ? [{ variantId, quantity: n }] : []),
      ],
      wishes,
    );
    return true;
  }
  function addToBag(variantId: number, total: number, photo: string, button: HTMLElement) {
    if (!quantity(variantId, total)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      open("bag");
      return;
    }
    const rect = button.getBoundingClientRect();
    setFlight({ photo, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }
  function wish(id: number) {
    persist(
      bag,
      wishes.includes(id) ? wishes.filter((i) => i !== id) : [...wishes, id],
    );
  }
  return {
    products,
    settings,
    user,
    loading,
    error,
    bag,
    wishes,
    quantity,
    addToBag,
    flight,
    setFlight,
    wish,
    signed,
    logout,
    drawer,
    open,
    message,
    notify,
    refresh,
    flush: () => pending.current,
    clear: () => persist([], wishes),
  };
}
const Store = createContext<ReturnType<typeof useModel> | null>(null);
export function Provider({ children }: { children: ReactNode }) {
  const value = useModel();
  return <Store.Provider value={value}>{children}</Store.Provider>;
}
export const useStore = () => useContext(Store)!;
