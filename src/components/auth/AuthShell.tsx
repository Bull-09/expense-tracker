export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-ink-raised border-r border-ink-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-emerald flex items-center justify-center font-ledger text-sm font-bold">
            ₹
          </div>
          <span className="font-semibold text-lg">C-137 Capital</span>
        </div>

        <div>
          <div className="font-ledger text-6xl font-bold tracking-tight mb-4">
            <span className="text-emerald">+42,500</span>
            <span className="text-paper/20"> / </span>
            <span className="text-clay">-18,230</span>
          </div>
          <p className="text-paper/50 text-lg max-w-md leading-relaxed">
            Every rupee in, every rupee out, every rupee owed. One tracker
            for your income, your expenses, and what you split with friends.
          </p>
        </div>

        <p className="text-paper/30 text-sm font-ledger">built for everyday money, by Nishant</p>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-10 justify-center">
            <div className="w-7 h-7 rounded-md bg-emerald flex items-center justify-center font-ledger text-sm font-bold">
              ₹
            </div>
            <span className="font-semibold text-lg">C-137 Capital</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
