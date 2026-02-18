type LoadingSpinnerProps = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
};

export function LoadingSpinner({
  label,
  size = 'md',
  inline = true
}: LoadingSpinnerProps) {
  return (
    <span className={`spinner-wrap ${inline ? 'spinner-inline' : ''}`.trim()}>
      <span className={`spinner spinner-${size}`} />
      {label && <span>{label}</span>}
    </span>
  );
}
