"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface InstagramAccountWithProducts {
  id: number;
  username: string;
  tokenExpiresAt: string;
  linkedProducts: { id: number; name: string }[];
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<InstagramAccountWithProducts[]>([]);
  const [loading, setLoading] = useState(true);

  const error = searchParams.get("error");
  const success = searchParams.get("success");

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    const res = await fetch("/api/instagram/accounts");
    const data = await res.json();
    setAccounts(data);
    setLoading(false);
  }

  const errorMessages: Record<string, string> = {
    oauth_denied: "Authorization was denied",
    token_exchange: "Failed to exchange token",
    no_pages: "No Facebook Pages found. Create a Page first.",
    no_instagram: "No Instagram Business Account linked to your Page",
    unknown: "An unknown error occurred",
  };

  return (
    <>
      {/* Status messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">
            {errorMessages[error] || error}
          </p>
        </div>
      )}

      {success === "connected" && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700">
            Instagram account connected successfully!
          </p>
        </div>
      )}

      {/* Instagram Accounts */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Instagram Accounts
          </h2>
          <a
            href="/api/instagram/auth"
            className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-purple-600 hover:to-pink-600"
          >
            + Add Account
          </a>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : accounts.length > 0 ? (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                    {account.username?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">@{account.username}</p>
                    <p className="text-xs text-gray-500">
                      Expires: {account.tokenExpiresAt ? new Date(account.tokenExpiresAt).toLocaleDateString() : "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {account.linkedProducts.length > 0 ? (
                    <div className="text-xs text-gray-600">
                      Linked to: {account.linkedProducts.map((p) => (
                        <Link key={p.id} href={`/products/${p.id}`} className="text-blue-600 hover:underline ml-1">
                          {p.name}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">Not linked to any product</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              No Instagram accounts connected yet. Add an account to start posting.
            </p>
            <p className="text-xs text-gray-500">
              Requirements: Facebook Page with linked Instagram Business Account
            </p>
          </div>
        )}
      </div>

      {/* Environment Variables Info */}
      <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Required Environment Variables
        </h2>
        <ul className="text-sm text-gray-600 space-y-2 font-mono">
          <li>FACEBOOK_APP_ID</li>
          <li>FACEBOOK_APP_SECRET</li>
          <li>INSTAGRAM_REDIRECT_URI</li>
        </ul>
        <p className="mt-4 text-xs text-gray-500">
          Get these from{" "}
          <a
            href="https://developers.facebook.com"
            target="_blank"
            className="text-blue-600 hover:underline"
          >
            developers.facebook.com
          </a>
        </p>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-gray-500 hover:text-gray-700">
            ←
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Suspense fallback={<p className="text-gray-500">Loading...</p>}>
          <SettingsContent />
        </Suspense>
      </main>
    </div>
  );
}
