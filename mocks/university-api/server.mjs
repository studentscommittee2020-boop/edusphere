/**
 * Mock university API — implements docs/UNIVERSITY-API.md exactly.
 *
 * Zero dependencies. Run it, point UNIVERSITY_API_BASE_URL at it, and the whole
 * student login + schedule + course-history flow works end to end offline.
 *
 *   node mocks/university-api/server.mjs
 *
 * Course codes below are real codes from 002_seed_data.sql, so synced
 * enrolments resolve to actual courses and pull real linked resources.
 *
 * Swapping to production: set UNIVERSITY_API_BASE_URL to the real host. This
 * file is never deployed and never imported by the app.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 8787);
const API_KEY = process.env.MOCK_API_KEY ?? "dev-university-key";

// Any file number matching this shape is accepted, EXCEPT those in DENYLIST —
// so you can exercise the rejection path without editing code.
const FILE_NUMBER_PATTERN = /^[A-Za-z0-9/-]{4,40}$/;
const DENYLIST = new Set(["FS2-00000", "invalid"]);

/** Deterministic per-email fixture so repeated logins give a stable timetable. */
function fixtureFor(email) {
  const seed = [...email].reduce((total, char) => total + char.charCodeAt(0), 0);
  const profiles = [
    {
      major: "Finance",
      semester: "LS5",
      track: "french",
      current: [
        { code: "ff3", label: "Financial Instruments", day: 1, start: "08:30", end: "10:00", room: "B204", teacher: "Dr. Haddad", kind: "lecture" },
        { code: "ff4", label: "Portfolio Management",  day: 1, start: "10:15", end: "11:45", room: "B204", teacher: "Dr. Haddad", kind: "td" },
        { code: "ff3", label: "Financial Instruments", day: 3, start: "13:00", end: "14:30", room: "A110", teacher: "Dr. Nassar", kind: "td" },
        { code: "ff4", label: "Portfolio Management",  day: 5, start: "09:00", end: "12:00", room: "Lab 2", teacher: "Dr. Nassar", kind: "tp" },
      ],
      history: ["fc1", "fc2", "fc3", "fc4", "ff1", "ff2"],
    },
    {
      major: "Audit & Accounting",
      semester: "LS5",
      track: "french",
      current: [
        { code: "fa4", label: "Banking Accounting", day: 2, start: "08:30", end: "10:00", room: "C301", teacher: "Dr. Khoury", kind: "lecture" },
        { code: "fa5", label: "Tax Accounting",     day: 2, start: "10:15", end: "11:45", room: "C301", teacher: "Dr. Khoury", kind: "lecture" },
        { code: "fa4", label: "Banking Accounting", day: 4, start: "14:00", end: "15:30", room: "C210", teacher: "Dr. Saad",   kind: "td" },
      ],
      history: ["fc1", "fc2", "fc5", "fa1", "fa2", "fa3"],
    },
    {
      major: "Common",
      semester: "LS1",
      track: "french",
      current: [
        { code: "fc1", label: "Accounting 1", day: 1, start: "09:00", end: "10:30", room: "A101", teacher: "Dr. Aoun",  kind: "lecture" },
        { code: "fc2", label: "Math 1",       day: 2, start: "09:00", end: "10:30", room: "A101", teacher: "Dr. Rizk",  kind: "lecture" },
        { code: "fc3", label: "General IT",   day: 3, start: "11:00", end: "13:00", room: "Lab 1", teacher: "Dr. Fares", kind: "tp" },
        { code: "fc4", label: "Microeconomics", day: 4, start: "09:00", end: "10:30", room: "A102", teacher: "Dr. Aoun", kind: "lecture" },
      ],
      history: [],
    },
  ];
  return profiles[seed % profiles.length];
}

function academicYear() {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 100_000) reject(new Error("body too large"));
    });
    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://localhost:${PORT}`);

  if (request.method !== "POST") {
    return send(response, 405, { error: "Method not allowed" });
  }
  if (request.headers.authorization !== `Bearer ${API_KEY}`) {
    return send(response, 401, { error: "Unauthorized" });
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    return send(response, 400, { error: "Invalid request" });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const fileNumber = String(body.file_number ?? "").trim();

  if (!email || !FILE_NUMBER_PATTERN.test(fileNumber) || DENYLIST.has(fileNumber)) {
    return send(response, 200, { verified: false });
  }

  const fixture = fixtureFor(email);
  const year = academicYear();

  if (pathname === "/verify") {
    return send(response, 200, {
      verified: true,
      email,
      student: {
        external_ref: `mock-${Buffer.from(email).toString("base64url").slice(0, 12)}`,
        full_name: email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        major: fixture.major,
        semester: fixture.semester,
        track: fixture.track,
        academic_year: year,
      },
    });
  }

  if (pathname === "/schedule") {
    return send(response, 200, {
      academic_year: year,
      semester: fixture.semester,
      entries: fixture.current.map((entry) => ({
        course_code: entry.code,
        course_label: entry.label,
        day_of_week: entry.day,
        starts_at: entry.start,
        ends_at: entry.end,
        room: entry.room,
        instructor: entry.teacher,
        kind: entry.kind,
      })),
    });
  }

  if (pathname === "/courses") {
    const current = [...new Set(fixture.current.map((entry) => entry.code))].map((code) => ({
      course_code: code,
      semester: fixture.semester,
      academic_year: year,
      status: "enrolled",
      grade: null,
    }));

    const past = fixture.history.map((code, index) => ({
      course_code: code,
      semester: `LS${Math.floor(index / 3) + 1}`,
      academic_year: `${Number(year.split("-")[0]) - 2 + Math.floor(index / 3)}-${
        Number(year.split("-")[1]) - 2 + Math.floor(index / 3)
      }`,
      status: "completed",
      grade: 60 + ((index * 7) % 35),
    }));

    return send(response, 200, { courses: [...current, ...past] });
  }

  return send(response, 404, { error: "Unknown endpoint" });
});

server.listen(PORT, () => {
  console.log(`Mock university API on http://localhost:${PORT}`);
  console.log(`  Bearer key: ${API_KEY}`);
  console.log(`  Endpoints:  POST /verify  POST /schedule  POST /courses`);
  console.log(`  Rejects:    file numbers ${[...DENYLIST].join(", ")}`);
});
