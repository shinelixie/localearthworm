export interface ReviewSetting {
  enabledModes: string[];
  errorsOnly: boolean;
  wrongRoundsThreshold: number;
  countShownAnswerAsError: boolean;
  dailyLimitsByMode: Record<string, number>;
  useSystemRecommended: boolean;
  /** 今日各模式已复习条数（GET 时返回） */
  todayCounts?: Record<string, number>;
}

export type UpdateReviewSettingPayload = Partial<Omit<ReviewSetting, "todayCounts">>;
