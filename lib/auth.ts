import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // For development, allow any credentials
        if (process.env.NODE_ENV === "development") {
          return {
            id: "1",
            name: "Development User",
            email: "dev@example.com",
          };
        }
        
        // In production, you would validate credentials here
        if (credentials?.username && credentials?.password) {
          // Add your authentication logic here
          return {
            id: "1",
            name: credentials.username,
            email: `${credentials.username}@example.com`,
          };
        }
        
        return null;
      }
    })
  ],
  pages: {
    signIn: "/auth/signin",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
}; 