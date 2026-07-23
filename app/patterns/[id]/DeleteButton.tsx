"use client";

export function DeleteButton() {
  return (
    <button
      type="submit"
      className="text-red-600 text-sm hover:underline"
      onClick={(e) => {
        if (!confirm("이 도안을 삭제할까요?")) e.preventDefault();
      }}
    >
      삭제
    </button>
  );
}
