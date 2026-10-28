import assert from "node:assert/strict";
import { test } from "node:test";
import { assertPortalUrl, isPortalUrl, SITE_ORIGINS, SITE_HOME } from "./sites.ts";

test("isPortalUrl: an https address on the site's own origin passes", () => {
  assert.equal(isPortalUrl("https://srar.selfreportedtranscript.com/srt/EnterSchools.aspx", "stars"), true);
  assert.equal(isPortalUrl("https://apply.universityofcalifornia.edu/my-application/login", "uc"), true);
  assert.equal(isPortalUrl("https://myillini.illinois.edu/Apply/Application/FreshmanSRAR?IsLower=False", "uiuc"), true);
  assert.equal(isPortalUrl("https://calstate.liaisoncas.com/applicant", "csu"), true);
  assert.equal(isPortalUrl("https://apply.commonapp.org/common/13/55", "common_app"), true);
  for (const site of Object.keys(SITE_ORIGINS) as (keyof typeof SITE_ORIGINS)[]) assert.equal(isPortalUrl(SITE_HOME[site], site), true, `${site} home`);
});

test("isPortalUrl: other sites, other schemes, look-alike hosts, user:password and bad input are refused", () => {
  const stars = (url: string) => isPortalUrl(url, "stars");
  assert.equal(stars("https://myillini.illinois.edu/"), false); // another portal
  assert.equal(stars("http://srar.selfreportedtranscript.com/srt/EnterSchools.aspx"), false); // not https
  assert.equal(stars("https://srar.selfreportedtranscript.com:8443/"), false); // another port is another origin
  assert.equal(stars("https://srar.selfreportedtranscript.com.evil.example/"), false);
  assert.equal(stars("https://evil.example/https://srar.selfreportedtranscript.com/"), false);
  assert.equal(stars("https://srar.selfreportedtranscript.com@evil.example/"), false); // the portal becomes the user name
  assert.equal(stars("https://srar.selfreportedtranscript.com:pw@evil.example/"), false);
  assert.equal(stars("https://user:pw@srar.selfreportedtranscript.com/"), false); // right host, but credentials ride along
  assert.equal(stars("https://user@srar.selfreportedtranscript.com/"), false);
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "chrome://extensions", "chrome-extension://abc/panel.html", "//evil.example/", "/srt/EnterSchools.aspx", "not a url", ""]) {
    assert.equal(stars(bad), false, bad);
  }
});

test("isPortalUrl: a path glued onto the origin cannot leave it", () => {
  const origin = SITE_ORIGINS.stars[0];
  assert.equal(isPortalUrl(`${origin}${"/srt/EnterSchools.aspx"}`, "stars"), true);
  assert.equal(isPortalUrl(`${origin}${"//evil.example/x"}`, "stars"), true); // still this origin: just a strange path
  assert.equal(isPortalUrl(`${origin}${"@evil.example/"}`, "stars"), false);
  assert.equal(isPortalUrl(`${origin}${".evil.example/"}`, "stars"), false);
  assert.equal(isPortalUrl(`${origin}${":8443/"}`, "stars"), false);
  assert.equal(isPortalUrl(`${origin}${"\\@evil.example/"}`, "stars"), true); // a backslash is a path separator in an https URL: still this origin
});

test("assertPortalUrl throws a sentence naming the portal", () => {
  assert.doesNotThrow(() => assertPortalUrl("https://apply.universityofcalifornia.edu/x", "uc", "UC"));
  assert.throws(() => assertPortalUrl("https://evil.example/", "uc", "UC"), /Refused to open an address outside UC/);
});
