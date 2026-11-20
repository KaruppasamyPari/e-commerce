export const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const response = await fetch(apiBase + "/api" + path, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      "X-Store-Request": "1",
      ...(!form && body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(
      Error(data.message || "Request failed. Please try again."),
      { status: response.status },
    );
  return data;
}
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const media = (url: string) => apiBase + url;
export type Variant = {
  id: number;
  productId: number;
  size: string;
  sku: string;
  colour: string;
  stock: number;
};
export type Product = {
  id: number;
  name: string;
  slug: string;
  category: { id: number; name: string };
  collection: { id: number; name: string };
  description: string;
  price: number;
  comparePrice: number | null;
  state: string;
  front: string;
  back: string;
  detail: string;
  picturedColour: string;
  variants: Variant[];
};
export type BagItem = { variantId: number; quantity: number };
export type Customer = { id: number; name: string; email: string | null; phone?: string | null };
export type Settings = {
  name: string;
  brandColour: string;
  shipping: number;
  freeOver: number;
  cod: boolean;
};
