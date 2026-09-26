import { Body, Controller, Delete, Get, Param, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { AffiliateLinkService, CreateLinkInput } from "./affiliate-link.service";
import { Public } from "../security/public.decorator";

@Controller("affiliate-links")
export class AffiliateLinkController {
  constructor(private readonly service: AffiliateLinkService) {}

  @Post()
  create(@Body() body: CreateLinkInput) {
    return this.service.createLink(body);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Public()
  @Get(":id/click")
  async click(@Param("id") id: string, @Req() req: Request, @Res() res: Response) {
    const destination = await this.service.recordClick(id, {
      userAgent: req.headers["user-agent"] ? String(req.headers["user-agent"]) : undefined,
      referrer: req.headers.referer ? String(req.headers.referer) : undefined,
    });
    res.setHeader("Referrer-Policy", "no-referrer");
    return res.redirect(302, destination);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.get(id);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}