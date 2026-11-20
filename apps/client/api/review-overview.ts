import type { ReviewPackOverview } from "~/types/models/review-overview";
import { getHttp } from "./http";

export async function fetchReviewOverview() {
  const http = getHttp();
  return (await http<ReviewPackOverview[]>("review/overview", {
    method: "get",
  })) as ReviewPackOverview[];
}
