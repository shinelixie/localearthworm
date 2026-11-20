import type { ReviewSetting, UpdateReviewSettingPayload } from "~/types/models/review-setting";
import { getHttp } from "./http";

export async function fetchReviewSetting() {
  const http = getHttp();
  return (await http<ReviewSetting>("review-settings", { method: "get" })) as ReviewSetting;
}

export async function updateReviewSetting(payload: UpdateReviewSettingPayload) {
  const http = getHttp();
  return (await http<ReviewSetting>("review-settings", {
    method: "put",
    body: payload,
  })) as ReviewSetting;
}
