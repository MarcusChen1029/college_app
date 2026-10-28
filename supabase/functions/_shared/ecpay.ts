// ECPay (綠界) AIO checkout helpers: CheckMacValue signing and checking, checkout form fields, trade numbers.
// Pure code: only the global Web Crypto (Node and the edge runtime both have it), no package imports and no
// runtime-specific calls, so the web tests (web/lib/ecpay.test.ts) and the payment edge functions run the same file.

// ECPay's public stage merchant (docs page "測試介接資訊"). The 3D OTP on stage is always 1234.
export const ECPAY_STAGE = {
  merchantId: "3002607",
  hashKey: "pwFHCqoQZGmho4w6",
  hashIv: "EkRm7iFT261dpevs",
  checkoutUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
} as const;

export const ECPAY_PRODUCTION_URL = "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5";

export type EcpayKeys = { merchantId: string; hashKey: string; hashIv: string };

// ECPay's "urlencode then lowercase" step, matching their .NET column: encodeURIComponent already leaves
// A-Za-z0-9 -_.!*() alone; .NET writes a space as +, escapes ' and writes ~ as %7e.
export function ecpayUrlEncode(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, "+").replace(/~/g, "%7e").replace(/'/g, "%27").toLowerCase();
}

// Keys sorted A to Z ignoring case (plain code-unit order only breaks ties).
function compareKeys(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x !== y) return x < y ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

// CheckMacValue: HashKey=..&k=v&...&HashIV=.. (keys sorted, CheckMacValue itself left out), urlencoded and
// lowercased, SHA-256, upper-case hex.
export async function checkMacValue(
  params: Record<string, string>,
  keys: { hashKey: string; hashIv: string },
): Promise<string> {
  const pairs = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort(compareKeys)
    .map((k) => `${k}=${params[k]}`);
  const raw = [`HashKey=${keys.hashKey}`, ...pairs, `HashIV=${keys.hashIv}`].join("&");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ecpayUrlEncode(raw)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// Equal-length strings are compared by XOR-accumulating char codes with no early exit; different length is false.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True only when params carries a CheckMacValue equal to the one computed from the rest. Never throws:
// a missing or empty value, or text that cannot be encoded, is false.
export async function verifyCheckMac(
  params: Record<string, string>,
  keys: { hashKey: string; hashIv: string },
): Promise<boolean> {
  const given = params.CheckMacValue;
  if (typeof given !== "string" || given === "") return false;
  let expected: string;
  try {
    expected = await checkMacValue(params, keys);
  } catch {
    return false;
  }
  return constantTimeEqual(given, expected);
}

// Taipei is UTC+8 all year (no daylight saving), so shifting by 8 hours and reading the UTC fields is exact.
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

function taipeiParts(d: Date): { year: string; mo: string; day: string; h: string; mi: string; s: string } {
  const t = new Date(d.getTime() + TAIPEI_OFFSET_MS);
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    year: String(t.getUTCFullYear()).padStart(4, "0"),
    mo: two(t.getUTCMonth() + 1),
    day: two(t.getUTCDate()),
    h: two(t.getUTCHours()),
    mi: two(t.getUTCMinutes()),
    s: two(t.getUTCSeconds()),
  };
}

// MerchantTradeDate format: yyyy/MM/dd HH:mm:ss in Taipei time.
export function ecpayDate(d: Date): string {
  const p = taipeiParts(d);
  return `${p.year}/${p.mo}/${p.day} ${p.h}:${p.mi}:${p.s}`;
}

// "TK" + yyMMddHHmmss (Taipei) + 6 base-36 characters = 20 alphanumeric characters (ECPay allows at most 20).
export function newMerchantTradeNo(now: Date, random: () => number = Math.random): string {
  const p = taipeiParts(now);
  let tail = "";
  for (let i = 0; i < 6; i++) tail += Math.min(35, Math.floor(random() * 36)).toString(36);
  return `TK${p.year.slice(-2)}${p.mo}${p.day}${p.h}${p.mi}${p.s}${tail}`;
}

// The form fields for ECPay's AioCheckOut/V5, without CheckMacValue (the caller signs these and adds it).
// Cards, ATM (3 days) and convenience-store codes (4320 minutes = 3 days) are on; the rest are ignored.
export function aioFields(o: {
  merchantId: string;
  merchantTradeNo: string;
  tradeDate: Date;
  amount: number;
  itemName: string;
  tradeDesc: string;
  returnUrl: string;
  paymentInfoUrl: string;
  clientBackUrl: string;
}): Record<string, string> {
  return {
    MerchantID: o.merchantId,
    MerchantTradeNo: o.merchantTradeNo,
    MerchantTradeDate: ecpayDate(o.tradeDate),
    PaymentType: "aio",
    TotalAmount: String(o.amount),
    TradeDesc: o.tradeDesc,
    ItemName: o.itemName,
    ReturnURL: o.returnUrl,
    ChoosePayment: "ALL",
    EncryptType: "1",
    ClientBackURL: o.clientBackUrl,
    IgnorePayment: "WebATM#BARCODE#TWQR#BNPL#WeiXin#ApplePay",
    PaymentInfoURL: o.paymentInfoUrl,
    ExpireDate: "3",
    StoreExpireDate: "4320",
    NeedExtraPaidInfo: "N",
  };
}
