import { useState, useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, money } from "../../../shared/client";
export function useData<T = any>(path: string) {
  const [data, set] = useState<T>(),
    [error, fail] = useState(""),
    [n, bump] = useState(0);
  useEffect(() => {
    let alive = true;
    set(undefined);
    fail("");
    api<T>(path)
      .then((x) => alive && set(x))
      .catch((e) => alive && fail(e.message));
    return () => {
      alive = false;
    };
  }, [path, n]);
  return { data, set, error, fail, reload: () => bump(n + 1) };
}
export function Pending({ error }: { error: string }) {
  return <p role="status">{error || "Loading…"}</p>;
}
export function Table({
  heads,
  rows,
}: {
  heads: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {heads.map((x) => (
              <th key={x}>{x}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((x, j) => (
                <td key={j}>{x}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p>No matching records.</p>}
    </div>
  );
}
export function OrderTable({ orders }: { orders: any[] }) {
  return (
    <Table
      heads={["Order", "Customer", "Status", "Total", "Placed"]}
      rows={orders.map((o) => [
        <Link to={"/orders/" + o.id}>#{o.id}</Link>,
        o.account?.name || o.address.recipient,
        o.status,
        money(o.total),
        new Date(o.created).toLocaleDateString("en-IN"),
      ])}
    />
  );
}
