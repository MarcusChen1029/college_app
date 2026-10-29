import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  aioFields,
  checkMacValue,
  ECPAY_PRODUCTION_URL,
  ECPAY_STAGE,
  ecpayDate,
  ecpayUrlEncode,
  newMerchantTradeNo,
  verifyCheckMac,
} from "../../supabase/functions/_shared/ecpay.ts";

const KEYS = { hashKey: "pwFHCqoQZGmho4w6", hashIv: "EkRm7iFT261dpevs" };

// The example from ECPay's AIO docs (stage merchant 3002607).
const DOC_PARAMS = {
  TradeDesc: "促銷方案",
  PaymentType: "aio",
  MerchantTradeDate: "2023/03/12 15:30:23",
  MerchantTradeNo: "ecpay20230312153023",
  MerchantID: "3002607",
  ReturnURL: "https://www.ecpay.com.tw/receive.php",
  ItemName: "Apple iphone 15",
  TotalAmount: "30000",
  ChoosePayment: "ALL",
  EncryptType: "1",
};
const DOC_MAC = "6C51C9E6888DE861FD62FB1DD17029FC742634498FD813DC43D4243B5685B840";

const SAMPLE_ORDER = {
  merchantId: ECPAY_STAGE.merchantId,
  merchantTradeNo: "TK261029003000abc123",
  tradeDate: new Date("2026-10-28T16:30:00Z"),
  amount: 990,
  itemName: "Trakur Fall 2027 pass",
  tradeDesc: "Trakur admission-year pass",
  returnUrl: "https://example.supabase.co/functions/v1/ecpay-notify",
  paymentInfoUrl: "https://example.supabase.co/functions/v1/ecpay-payment-info",
  clientBackUrl: "https://www.track-ur-college.com/settings",
};

test("CheckMacValue matches ECPay's documented example", async () => {
  assert.equal(await checkMacValue(DOC_PARAMS, KEYS), DOC_MAC);
});

test("CheckMacValue ignores a CheckMacValue already in the params and the order keys were added in", async () => {
  assert.equal(await checkMacValue({ ...DOC_PARAMS, CheckMacValue: "ANYTHING" }, KEYS), DOC_MAC);
  const reversed = Object.fromEntries(Object.entries(DOC_PARAMS).reverse());
  assert.equal(await checkMacValue(reversed, KEYS), DOC_MAC);
});

test("CheckMacValue sorts keys case-insensitively, not by code unit", async () => {
  // The whole joined string is urlencoded and lowercased before hashing, so = and & become %3d and %26.
  // ECPay wants alpha first; a plain code-unit sort would put "Zeta" first.
  const sha = (s: string) => createHash("sha256").update(s).digest("hex").toUpperCase();
  const mac = await checkMacValue({ Zeta: "2", alpha: "1" }, { hashKey: "k", hashIv: "v" });
  assert.equal(mac, sha("hashkey%3dk%26alpha%3d1%26zeta%3d2%26hashiv%3dv"));
  assert.notEqual(mac, sha("hashkey%3dk%26zeta%3d2%26alpha%3d1%26hashiv%3dv"));
});

test("verifyCheckMac accepts a signed set and rejects a changed amount, a missing MAC or a lowercased or cut-short MAC", async () => {
  const mac = await checkMacValue(DOC_PARAMS, KEYS);
  const signed = { ...DOC_PARAMS, CheckMacValue: mac };
  assert.equal(await verifyCheckMac(signed, KEYS), true);
  assert.equal(await verifyCheckMac({ ...signed, TotalAmount: "1" }, KEYS), false);
  assert.equal(await verifyCheckMac({ ...signed, MerchantID: "3002608" }, KEYS), false);
  assert.equal(await verifyCheckMac(DOC_PARAMS, KEYS), false); // CheckMacValue missing
  assert.equal(await verifyCheckMac({ ...DOC_PARAMS, CheckMacValue: "" }, KEYS), false);
  assert.equal(await verifyCheckMac({ ...signed, CheckMacValue: mac.toLowerCase() }, KEYS), false);
  assert.equal(await verifyCheckMac({ ...signed, CheckMacValue: mac.slice(0, -1) }, KEYS), false);
  assert.equal(await verifyCheckMac({ ...signed, CheckMacValue: mac + "0" }, KEYS), false);
  assert.equal(await verifyCheckMac(signed, { hashKey: KEYS.hashKey, hashIv: "other" }), false);
});

// What an attacker computes when the server's secret is missing: the same algorithm with the key text they can guess.
function macWithKeyText(params: Record<string, string>, keyText: string, ivText: string): string {
  const pairs = Object.keys(params)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
    .map((k) => `${k}=${params[k]}`);
  const raw = [`HashKey=${keyText}`, ...pairs, `HashIV=${ivText}`].join("&");
  return createHash("sha256").update(ecpayUrlEncode(raw)).digest("hex").toUpperCase();
}

test("the attacker-side helper reproduces the real MAC when the keys are real (so the next tests mean something)", async () => {
  assert.equal(macWithKeyText(DOC_PARAMS, KEYS.hashKey, KEYS.hashIv), DOC_MAC);
});

test("verifyCheckMac is false for a MAC signed with empty keys, whichever key is empty", async () => {
  const forged = { ...DOC_PARAMS, CheckMacValue: macWithKeyText(DOC_PARAMS, "", "") };
  assert.equal(await verifyCheckMac(forged, { hashKey: "", hashIv: "" }), false);
  const keyOnly = { ...DOC_PARAMS, CheckMacValue: macWithKeyText(DOC_PARAMS, "", KEYS.hashIv) };
  assert.equal(await verifyCheckMac(keyOnly, { hashKey: "", hashIv: KEYS.hashIv }), false);
  const ivOnly = { ...DOC_PARAMS, CheckMacValue: macWithKeyText(DOC_PARAMS, KEYS.hashKey, "") };
  assert.equal(await verifyCheckMac(ivOnly, { hashKey: KEYS.hashKey, hashIv: "" }), false);
});

test("verifyCheckMac is false for a MAC signed with the text 'undefined' when the keys are undefined", async () => {
  const missing = undefined as unknown as string;
  const forged = { ...DOC_PARAMS, CheckMacValue: macWithKeyText(DOC_PARAMS, "undefined", "undefined") };
  assert.equal(await verifyCheckMac(forged, { hashKey: missing, hashIv: missing }), false);
  assert.equal(await verifyCheckMac(forged, { hashKey: missing, hashIv: KEYS.hashIv }), false);
  assert.equal(await verifyCheckMac(forged, { hashKey: KEYS.hashKey, hashIv: missing }), false);
});

test("checkMacValue refuses to sign with an empty or missing key or iv", async () => {
  const missing = undefined as unknown as string;
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: "", hashIv: KEYS.hashIv }));
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: KEYS.hashKey, hashIv: "" }));
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: "", hashIv: "" }));
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: missing, hashIv: KEYS.hashIv }));
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: KEYS.hashKey, hashIv: missing }));
  await assert.rejects(checkMacValue(DOC_PARAMS, { hashKey: null as unknown as string, hashIv: KEYS.hashIv }));
  // Real keys still sign.
  assert.equal(await checkMacValue(DOC_PARAMS, KEYS), DOC_MAC);
});

test("verifyCheckMac returns false instead of throwing on text that cannot be encoded", async () => {
  // A lone surrogate makes encodeURIComponent throw; a bad notice must be rejected, not crash the handler.
  assert.equal(await verifyCheckMac({ ItemName: "\ud800", CheckMacValue: DOC_MAC }, KEYS), false);
});

test("ecpayUrlEncode keeps -_.!*() and encodes space as +", () => {
  assert.equal(ecpayUrlEncode("a b-_.!*()~'"), "a+b-_.!*()%7e%27");
});

test("ecpayUrlEncode lowercases the percent escapes and encodes a literal plus", () => {
  assert.equal(ecpayUrlEncode("促銷+A/B=C&D"), "%e4%bf%83%e9%8a%b7%2ba%2fb%3dc%26d");
});

test("ecpayDate formats Taipei time (UTC+8), across a day and a year boundary", () => {
  assert.equal(ecpayDate(new Date("2026-10-28T16:30:05Z")), "2026/10/29 00:30:05");
  assert.equal(ecpayDate(new Date("2026-12-31T16:00:00Z")), "2027/01/01 00:00:00");
  assert.equal(ecpayDate(new Date("2026-03-05T07:08:09Z")), "2026/03/05 15:08:09");
});

test("trade number is 20 alnum chars in Taipei time", () => {
  assert.match(newMerchantTradeNo(new Date("2026-10-28T16:30:00Z"), () => 0.5), /^TK261029003000[0-9a-z]{6}$/);
  assert.equal(newMerchantTradeNo(new Date("2026-10-28T16:30:00Z"), () => 0.5), "TK261029003000iiiiii");
});

test("trade number random part covers 0..z and never overflows when random() is close to 1", () => {
  const now = new Date("2026-10-28T16:30:00Z");
  assert.equal(newMerchantTradeNo(now, () => 0), "TK261029003000000000");
  assert.equal(newMerchantTradeNo(now, () => 0.9999999999), "TK261029003000zzzzzz");
});

test("trade numbers made with the default random source are 20 alnum chars and differ", () => {
  const now = new Date("2026-10-28T16:30:00Z");
  const a = newMerchantTradeNo(now);
  const b = newMerchantTradeNo(now);
  assert.match(a, /^TK261029003000[0-9a-z]{6}$/);
  assert.equal(a.length, 20);
  assert.notEqual(a, b);
});

test("stage and production constants", () => {
  assert.deepEqual(
    { ...ECPAY_STAGE },
    {
      merchantId: "3002607",
      hashKey: "pwFHCqoQZGmho4w6",
      hashIv: "EkRm7iFT261dpevs",
      checkoutUrl: "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
    },
  );
  assert.equal(ECPAY_PRODUCTION_URL, "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5");
});

test("aioFields sets the fixed values", () => {
  const f = aioFields(SAMPLE_ORDER);
  assert.equal(f.PaymentType, "aio");
  assert.equal(f.EncryptType, "1");
  assert.equal(f.ChoosePayment, "ALL");
  assert.equal(f.IgnorePayment, "WebATM#BARCODE#TWQR#BNPL#WeiXin#ApplePay");
  assert.equal(f.ExpireDate, "3");
  assert.equal(f.StoreExpireDate, "4320");
  assert.equal(f.NeedExtraPaidInfo, "N");
  assert.equal(f.TotalAmount, "990");
});

test("aioFields maps the order onto ECPay's field names, formats the date in Taipei time and leaves the MAC to the caller", () => {
  const f = aioFields(SAMPLE_ORDER);
  assert.equal(f.MerchantID, "3002607");
  assert.equal(f.MerchantTradeNo, "TK261029003000abc123");
  assert.equal(f.MerchantTradeDate, "2026/10/29 00:30:00");
  assert.equal(f.ItemName, "Trakur Fall 2027 pass");
  assert.equal(f.TradeDesc, "Trakur admission-year pass");
  assert.equal(f.ReturnURL, SAMPLE_ORDER.returnUrl);
  assert.equal(f.PaymentInfoURL, SAMPLE_ORDER.paymentInfoUrl);
  assert.equal(f.ClientBackURL, SAMPLE_ORDER.clientBackUrl);
  assert.equal("CheckMacValue" in f, false);
  assert.equal(Object.keys(f).length, 16);
  for (const v of Object.values(f)) assert.equal(typeof v, "string");
});

test("a form built by aioFields signs and verifies with the stage keys", async () => {
  const f = aioFields(SAMPLE_ORDER);
  const mac = await checkMacValue(f, ECPAY_STAGE);
  assert.match(mac, /^[0-9A-F]{64}$/);
  assert.equal(await verifyCheckMac({ ...f, CheckMacValue: mac }, ECPAY_STAGE), true);
  assert.equal(await verifyCheckMac({ ...f, TotalAmount: "99", CheckMacValue: mac }, ECPAY_STAGE), false);
});
