import { SignupRoleFlow } from "@/components/signup-role-flow";

export default function MechanicSignUpScreen() {
  return (
    <SignupRoleFlow
      role="mechanic"
      titleKey="auth.signup.mechanic_title"
      subtitleKey="auth.signup.mechanic_subtitle"
    />
  );
}
