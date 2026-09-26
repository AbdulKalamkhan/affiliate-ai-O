import { AffiliateLinkController } from "./affiliate-link.controller";
import type { AffiliateLinkService } from "./affiliate-link.service";
import type { Request, Response } from "express";

const makeRes = () => {
  const calls: { headers: Record<string, string>; redirect: { code: number; url: string } | null } = {
    headers: {},
    redirect: null,
  };
  const res = {
    setHeader(key: string, value: string) {
      calls.headers[key] = value;
      return res;
    },
    redirect(code: number, url: string) {
      calls.redirect = { code, url };
      return res;
    },
  };
  return { res: res as unknown as Response, calls };
};

const makeReq = (headers: Record<string, string | undefined> = {}) => ({ headers }) as unknown as Request;

describe("AffiliateLinkController", () => {
  const destination = "https://www.amazon.in/dp/B08BG1HC7R?tag=zorajewellery-21";

  it("sets Referrer-Policy no-referrer and 302-redirects to the stored destination on click", async () => {
    const service = {
      recordClick: jest.fn().mockResolvedValue(destination),
      get: jest.fn(),
      list: jest.fn(),
      remove: jest.fn(),
      createLink: jest.fn(),
    } as unknown as AffiliateLinkService;
    const { res, calls } = makeRes();

    await new AffiliateLinkController(service).click("link-1", makeReq({ "user-agent": "jest" }), res);

    expect(calls.headers["Referrer-Policy"]).toBe("no-referrer");
    expect(calls.redirect).toEqual({ code: 302, url: destination });
  });

  it("forwards user-agent and referer to the service without storing them raw in the redirect", async () => {
    const service = {
      recordClick: jest.fn().mockResolvedValue(destination),
    } as unknown as AffiliateLinkService;
    const { res } = makeRes();

    await new AffiliateLinkController(service).click(
      "link-1",
      makeReq({ "user-agent": "jest-agent", referer: "https://pinterest.com/" }),
      res,
    );

    expect(service.recordClick).toHaveBeenCalledWith("link-1", {
      userAgent: "jest-agent",
      referrer: "https://pinterest.com/",
    });
  });

  it("does not redirect when the service rejects the click id", async () => {
    const service = {
      recordClick: jest.fn().mockRejectedValue(new Error("not found")),
    } as unknown as AffiliateLinkService;
    const { res, calls } = makeRes();

    await expect(new AffiliateLinkController(service).click("missing", makeReq(), res)).rejects.toThrow("not found");
    expect(calls.redirect).toBeNull();
  });
});