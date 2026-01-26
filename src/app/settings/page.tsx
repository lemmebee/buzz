"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

interface InstagramAccount {
  connected: boolean;
  username?: string;
  expiresAt?: string;
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<InstagramAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const error = searchParams.get("error");
  const success = searchParams.get("success");

  useEffect(() => {
    fetchAccount();
  }, []);

  async function fetchAccount() {
    const res = await fetch("/api/instagram/account");
    const data = await res.json();
    setAccount(data);
    setLoading(false);
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect Instagram account?")) return;

    setDisconnecting(true);
    await fetch("/api/instagram/account", { method: "DELETE" });
    setAccount({ connected: false });
    setDisconnecting(false);
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

      {/* Instagram Connection */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">
          Instagram Connection
        </h2>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : account?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-bold">
                {account.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  @{account.username}
                </p>
                <p className="text-xs text-gray-500">
                  Token expires:{" "}
                  {account.expiresAt
                    ? new Date(account.expiresAt).toLocaleDateString()
                    : "Unknown"}
                </p>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="px-4 py-2 text-red-600 text-sm font-medium border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Connect your Instagram Business Account to start posting content.
            </p>
            <p className="text-xs text-gray-500">
              Requirements: Facebook Page with linked Instagram Business Account
            </p>

            <a
              href="/api/instagram/auth"
              className="inline-block px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium rounded-lg hover:from-purple-600 hover:to-pink-600"
            >
              Connect Instagram
            </a>
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
