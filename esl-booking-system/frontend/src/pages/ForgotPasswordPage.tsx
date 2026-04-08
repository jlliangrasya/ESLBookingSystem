import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Mail } from "lucide-react";

const ForgotPasswordPage = () => {
  return (
    <div className="min-h-screen brand-gradient-subtle pattern-dots-light flex items-center justify-center px-4">
      <Card className="w-full max-w-md glow-card rounded-2xl border-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-center text-primary text-xl font-semibold">
            Forgot Password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center space-y-4 py-4">
            <div className="flex justify-center">
              <div className="p-3 bg-blue-100 rounded-full">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              To reset your password, please send an email to:
            </p>
            <a
              href="mailto:brightfolks@gmail.com"
              className="text-primary font-semibold hover:underline text-base"
            >
              brightfolks@gmail.com
            </a>
            <p className="text-xs text-muted-foreground">
              Include your registered email address and we'll help you reset your password.
            </p>
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ForgotPasswordPage;
