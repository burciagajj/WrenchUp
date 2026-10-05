import { SignupRoleFlow } from "@/components/signup-role-flow";

export default function CustomerSignUpScreen() {
  return (
    <SignupRoleFlow
      role="customer"
      titleKey="auth.signup.customer_title"
      subtitleKey="auth.signup.customer_subtitle"
    />
  );
}
