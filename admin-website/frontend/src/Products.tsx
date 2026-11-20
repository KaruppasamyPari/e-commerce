import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, media, money } from "../../../shared/client";
import { useData, Table, Pending } from "./helpers";
export function Products() {
  const { data, error, fail } = useData("/products"),
    [search, q] = useState(""),
    [state, filter] = useState(""),
    go = useNavigate();
  async function create() {
    try {
      const p = await api("/products", "POST");
      go("/products/" + p.id);
    } catch (e: any) {
      fail(e.message);
    }
  }
  return (
    <>
      <div className="head">
        <h1>Products</h1>
        <button className="primary" onClick={create}>
          Create product
        </button>
      </div>
      <div className="tools">
        <input
          aria-label="Search products"
          placeholder="Search name or slug"
          value={search}
          onChange={(e) => q(e.target.value)}
        />
        <select
          aria-label="Publication state"
          value={state}
          onChange={(e) => filter(e.target.value)}
        >
          <option value="">All states</option>
          {["draft", "published", "archived"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {error && <p role="alert">{error}</p>}
      {data ? (
        <Table
          heads={["Product", "State", "Collection", "Price", "Stock"]}
          rows={data
            .filter(
              (p: any) =>
                (p.name + " " + p.slug)
                  .toLowerCase()
                  .includes(search.toLowerCase()) &&
                (!state || p.state === state),
            )
            .map((p: any) => [
              <Link to={"/products/" + p.id}>
                {p.name || "Untitled draft"}
              </Link>,
              p.state,
              p.collection?.name,
              p.price ? money(p.price) : "—",
              p.variants.reduce((a: number, v: any) => a + v.stock, 0),
            ])}
        />
      ) : (
        <Pending error={error} />
      )}
    </>
  );
}
export function Editor() {
  const { id } = useParams(),
    source = useData("/products/" + id),
    taxonomy = useData("/taxonomy"),
    [p, set] = useState<any>(),
    [err, fail] = useState(""),
    [busy, wait] = useState(false),
    [preview, show] = useState(false),
    [msg, notify] = useState("");
  function adopt(v: any) {
    set({
      ...v,
      variants: v.variants.map((i: any) => ({ ...i, originalStock: i.stock })),
    });
  }
  useEffect(() => {
    if (source.data) adopt(source.data);
  }, [source.data]);
  if (!p || !taxonomy.data)
    return <Pending error={source.error || taxonomy.error} />;
  const field = (k: string, v: any) => {
    set((prev: any) => ({ ...prev, [k]: v }));
    notify("");
  };
  async function save(state: string) {
    wait(true);
    fail("");
    try {
      adopt(await api("/products/" + id, "PUT", { ...p, state }));
      notify("Saved · " + state);
    } catch (e: any) {
      fail(e.message);
    } finally {
      wait(false);
    }
  }
  async function upload(slot: string, file?: File) {
    if (!file) return;
    wait(true);
    fail("");
    try {
      const f = new FormData();
      f.append("file", file);
      field(slot, (await api("/uploads", "POST", f)).url);
    } catch (e: any) {
      fail(e.message);
    } finally {
      wait(false);
    }
  }
  return (
    <>
      <Link to="/products">All products</Link>
      <div className="head">
        <div>
          <p className="eyebrow">{p.state}</p>
          <h1>{p.name || "New product"}</h1>
        </div>
        <button onClick={() => show(!preview)}>
          {preview ? "Edit product" : "Preview"}
        </button>
      </div>
      {preview ? (
        <section className="box">
          <h2>{p.name || "Untitled draft"}</h2>
          <p>{p.description}</p>
          <p>
            {money(p.price || 0)} · {p.picturedColour}
          </p>
          <div className="slots">
            {["front", "back", "detail"].map(
              (k) =>
                p[k] && <img src={media(p[k])} key={k} alt={k + " view"} />,
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="box">
            <h2>Product details</h2>
            <div className="fields">
              {["name", "slug", "picturedColour"].map((k) => (
                <label key={k}>
                  {k === "picturedColour" ? "Pictured colour" : k}
                  <input
                    value={p[k] || ""}
                    onChange={(e) => field(k, e.target.value)}
                  />
                </label>
              ))}
              {["category", "collection"].map((k) => (
                <label key={k}>
                  {k}
                  <select
                    value={p[k + "Id"] || ""}
                    onChange={(e) =>
                      field(k + "Id", Number(e.target.value) || null)
                    }
                  >
                    <option value="">Choose {k}</option>
                    {taxonomy.data[
                      k === "category" ? "categories" : "collections"
                    ].map((x: any) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {["price", "comparePrice"].map((k) => (
                <label key={k}>
                  {k === "price" ? "Price" : "Compare-at price"} (₹)
                  <input
                    type="number"
                    min="0.01"
                    step=".01"
                    value={p[k] == null ? "" : p[k] / 100}
                    onChange={(e) =>
                      field(
                        k,
                        e.target.value
                          ? Math.round(Number(e.target.value) * 100)
                          : null,
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <label>
              Description
              <textarea
                rows={3}
                value={p.description}
                onChange={(e) => field("description", e.target.value)}
              />
            </label>
          </div>
          <div className="box">
            <h2>Product photography</h2>
            <div className="slots">
              {["front", "back", "detail"].map((k) => (
                <label key={k}>
                  {k}
                  {p[k] && <img src={media(p[k])} alt={k + " view"} />}
                  <input
                    disabled={busy}
                    type="file"
                    accept="image/webp,image/png,image/jpeg"
                    onChange={(e) => upload(k, e.target.files?.[0])}
                  />
                </label>
              ))}
            </div>
            <small>JPEG, PNG or WebP · 5 MB maximum each</small>
          </div>
          <div className="box">
            <h2>Variants and inventory</h2>
            {p.variants.map((v: any, i: number) => (
              <div className="variant" key={i}>
                {["sku", "size", "colour", "stock"].map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      value={v[k]}
                      type={k === "stock" ? "number" : "text"}
                      min={0}
                      onChange={(e) =>
                        field(
                          "variants",
                          p.variants.map((a: any, j: number) =>
                            i === j
                              ? {
                                  ...a,
                                  [k]:
                                    k === "stock"
                                      ? Number(e.target.value)
                                      : e.target.value,
                                }
                              : a,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  onClick={() =>
                    field(
                      "variants",
                      p.variants.filter((_: any, j: number) => j !== i),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                field("variants", [
                  ...p.variants,
                  { sku: "", size: "", colour: "", stock: 0 },
                ])
              }
            >
              Add variant
            </button>
          </div>
        </>
      )}
      <div className="actions">
        {err && (
          <p role="alert">
            {err}{" "}
            <button
              onClick={() => {
                source.reload();
                fail("");
              }}
            >
              Reload editor
            </button>
          </p>
        )}
        {msg && <p role="status">{msg}</p>}
        <button disabled={busy} onClick={() => save("draft")}>
          {p.state === "published" ? "Unpublish" : "Save draft"}
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => save("published")}
        >
          {p.state === "published" ? "Save published changes" : "Publish"}
        </button>
        <button disabled={busy} onClick={() => save("archived")}>
          Archive
        </button>
      </div>
    </>
  );
}
