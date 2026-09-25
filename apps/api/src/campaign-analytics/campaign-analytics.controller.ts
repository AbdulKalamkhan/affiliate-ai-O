import { Controller, Get } from "@nestjs/common";
import { CampaignAnalyticsService } from "./campaign-analytics.service";

@Controller("campaign-analytics")
export class CampaignAnalyticsController {
  constructor(private readonly service: CampaignAnalyticsService) {}

  @Get("overview")
  overview() {
    return this.service.overview();
  }
}