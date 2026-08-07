import { assertWritable, supabase } from "@/lib/supabase";

export async function requestStudentOtp(email: string, fileNumber: string) {
  assertWritable("request a student sign-in code");
  const { data, error } = await supabase.functions.invoke("student-otp", {
    body: { email: email.trim().toLowerCase(), fileNumber: fileNumber.trim() },
  });

  if (error) return { error };
  if (!data?.ok) return { error: new Error("We could not verify those student details.") };
  return { error: null };
}

export async function verifyStudentOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  return { data, error };
}

// ---------------------------------------------------------------------------
// Staff passwordless sign-in (email OTP)
//
// This is a SEPARATE path from the student flow above, on purpose:
//   - It does NOT call the `student-otp` Edge Function.
//   - It does NOT verify a university file number.
// That verification is the entire basis for `student_verified` / `is_verified_student()`
// in the database, so this path must never be reachable from student sign-in as a
// shortcut around it. A student who somehow completed this flow would still land as
// an unverified account and be correctly denied by `is_verified_student()` — but the
// UI must not invite that confusion in the first place. Keep it presented as staff-only.
//
// It's for doctor / committee_admin / admin accounts an administrator has already
// created directly in Supabase Auth — an alternative to password sign-in, not a
// replacement for it.
// ---------------------------------------------------------------------------

export async function requestStaffOtp(email: string) {
  const { data, error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      // MANDATORY. Without this, signInWithOtp silently creates a brand-new account
      // for any email typed into the box, turning the sign-in form into open
      // self-registration. This is the one line that must never be dropped or flipped.
      shouldCreateUser: false,
    },
  });
  return { data, error };
}

export async function verifyStaffOtp(email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  return { data, error };
}
