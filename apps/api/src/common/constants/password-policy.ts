export const PASSWORD_POLICY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,72}$/;

export const PASSWORD_POLICY_MESSAGE =
  'Password must be 12-72 characters and include uppercase, lowercase, number, and special character.';
