export type FeedbackType = "suggestion" | "claim";
export type FeedbackAuthorRole = "admin" | "operator";

export type FeedbackEntry = {
  id: string;
  type: FeedbackType;
  message: string;
  isAnonymous: boolean;
  createdAt: string;
  createdBy: string;
  createdByRole: FeedbackAuthorRole;
};

export type FeedbackDraft = {
  type: FeedbackType;
  message: string;
  isAnonymous: boolean;
  createdBy: string;
  createdByRole: FeedbackAuthorRole;
};
