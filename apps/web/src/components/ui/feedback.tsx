type FeedbackProps = {
  message: string;
};

export function ErrorMessage({ message }: FeedbackProps) {
  return <p className="feedback feedback-error">{message}</p>;
}

export function SuccessMessage({ message }: FeedbackProps) {
  return <p className="feedback feedback-success">{message}</p>;
}

export function HintMessage({ message }: FeedbackProps) {
  return <p className="feedback feedback-hint">{message}</p>;
}
