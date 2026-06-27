"use client";

import { useState, useEffect, useRef } from "react";
import { InstagramAccount } from "../../drizzle/schema";

interface InstagramLinkModalProps {
  productId: number;
  linkedAccountId: number | null;
  onClose: () => void;
  onLinked: (accountId: number | null) => void;
}

export function InstagramLinkModal({ productId, linkedAccountId, onClose, onLinked }: InstagramLinkModalProps) {
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((res) => res.json())
      .then((data) => {
        setAccounts(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function linkAccount(accountId: number) {
    setLinking(true);
    try {
      const res = await fetch("/api/instagram/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, accountId }),
      });
      if (res.ok) {
        onLinked(accountId);
        onClose();
      }
    } finally {
      setLinking(false);
    }
  }

  async function unlinkAccount() {
    setLinking(true);
    try {
      const res = await fetch("/api/instagram/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) {
        onLinked(null);
        onClose();
      }
    } finally {
      setLinking(false);
    }
  }

  function connectNew() {
    window.location.href = `/api/instagram/auth?productId=${productId}`;
  }

  const linkedAccount = accounts.find((a) => a.id === linkedAccountId);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="bg-surface rounded-lg w-full max-w-md shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h3 className="font-medium text-text-primary">Link Instagram</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-secondary text-xl">
            ×
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-sm text-text-tertiary">Loading...</p>
          ) : linkedAccount ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-success-bg border border-success-bg rounded-lg">
                <div>
                  <p className="text-sm font-medium text-text-primary">@{linkedAccount.username}</p>
                  <p className="text-xs text-text-tertiary">Currently linked</p>
                </div>
                <button
                  onClick={unlinkAccount}
                  disabled={linking}
                  className="text-sm px-3 py-1 text-error hover:text-error disabled:opacity-50"
                >
                  Unlink
                </button>
              </div>
              <p className="text-xs text-text-tertiary">Or switch to another account:</p>
              <div className="space-y-2">
                {accounts
                  .filter((a) => a.id !== linkedAccountId)
                  .map((account) => (
                    <button
                      key={account.id}
                      onClick={() => linkAccount(account.id)}
                      disabled={linking}
                      className="w-full text-left p-3 border border-border rounded-lg hover:bg-background disabled:opacity-50"
                    >
                      <p className="text-sm font-medium text-text-primary">@{account.username}</p>
                    </button>
                  ))}
              </div>
            </div>
          ) : accounts.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">Select an Instagram account to link:</p>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => linkAccount(account.id)}
                    disabled={linking}
                    className="w-full text-left p-3 border border-border rounded-lg hover:bg-background disabled:opacity-50"
                  >
                    <p className="text-sm font-medium text-text-primary">@{account.username}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-tertiary">No Instagram accounts connected yet.</p>
          )}
        </div>

        <div className="p-4 border-t border-border">
          <button
            onClick={connectNew}
            className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-medium rounded-lg hover:from-purple-600 hover:to-pink-600"
          >
+ Add Account
          </button>
        </div>
      </div>
    </div>
  );
}
