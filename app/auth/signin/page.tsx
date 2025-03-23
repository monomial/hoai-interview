'use client';

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export default function SignIn() {
  const router = useRouter();

  const handleSignIn = async () => {
    // For development, sign in with default credentials
    const result = await signIn("credentials", {
      username: "dev",
      password: "dev",
      redirect: false,
    });

    if (result?.ok) {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Sign in to your account</h2>
          <p className="mt-2 text-sm text-gray-600">
            For development, click the button below to sign in
          </p>
        </div>
        <div className="mt-8">
          <Button
            onClick={handleSignIn}
            className="w-full"
          >
            Sign in
          </Button>
        </div>
      </div>
    </div>
  );
} 