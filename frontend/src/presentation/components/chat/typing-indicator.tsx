/** Three-dot "assistant is typing" animation. */
export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1" aria-label="Yanıt hazırlanıyor" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2 animate-bounce rounded-full bg-muted-foreground/60"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}
