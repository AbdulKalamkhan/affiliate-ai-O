import { Module } from "@nestjs/common";
import { CampaignAnalyticsController } from "./campaign-analytics.controller";
import { CampaignAnalyticsService } from "./campaign-analytics.service";

@Module({
  controllers: [CampaignAnalyticsController],
  providers: [CampaignAnalyticsService],
})
export class CampaignAnalyticsModule {}