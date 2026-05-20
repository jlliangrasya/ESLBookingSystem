import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import introJs from "intro.js";
import "intro.js/introjs.css";
import { useTour } from "@/hooks/useTour";

export type TourSegment = "A" | "B" | "C" | "D" | "E" | "F";

interface Props {
  segment: TourSegment;
  companyId: number;
  autoStart?: boolean;
}

function el(id: string) {
  return document.getElementById(id) ? `#${id}` : undefined;
}

function getSteps(segment: TourSegment) {

  // ── A: Dashboard overview ────────────────────────────────────────────────
  if (segment === "A") {
    const steps: object[] = [
      {
        intro: `<strong>Welcome to Brightfolks!</strong><br/><br/>
          This quick tour will walk you through everything you need to get your school running:<br/><br/>
          📦 Create a class package<br/>
          👩‍🏫 Add a teacher &amp; open their availability<br/>
          🎓 Add a student &amp; send them their login<br/>
          📅 Book a class<br/><br/>
          Click <strong>Next</strong> to begin.`,
        title: "Getting Started",
      },
      {
        element: "#nav-packages",
        intro: `<strong>Step 1 — Class Packages</strong><br/><br/>
          Before you can enroll a student, you need at least one class package.<br/><br/>
          A package defines the subject, number of sessions, duration per class, and price.<br/><br/>
          You'll also set up your <strong>payment method</strong> and other company settings here.`,
        title: "Class Packages",
      },
      {
        element: "#nav-teachers",
        intro: `<strong>Step 2 — Teachers</strong><br/><br/>
          Add your teachers here. Each teacher gets their own account to manage their schedule and view their classes.<br/><br/>
          ⚠️ <strong>Critical:</strong> After adding a teacher, you or the teacher must open their <strong>weekly availability slots</strong> on their profile page. Students can only book into open (green) slots — if no slots are open, nobody can book.`,
        title: "Teachers",
      },
      {
        element: "#nav-students",
        intro: `<strong>Step 3 — Students</strong><br/><br/>
          Register your students here. You set their login credentials and share them.<br/><br/>
          <strong>What happens after a student logs in:</strong><br/>
          1️⃣ They browse your class packages and pick one<br/>
          2️⃣ They submit payment (Alipay QR or contact you directly)<br/>
          3️⃣ You confirm their payment here on the dashboard<br/>
          4️⃣ They can then pick an available time slot and book a class`,
        title: "Students & Their Booking Flow",
      },
      {
        element: "#nav-admin-dashboard",
        intro: `<strong>Step 4 — Dashboard</strong><br/><br/>
          This is your command center. It shows:<br/>
          • Today's scheduled classes<br/>
          • Students waiting for payment confirmation<br/>
          • Teacher workload overview<br/>
          • Analytics and growth charts<br/><br/>
          You can also book classes on behalf of students directly from their profile.`,
        title: "Dashboard Overview",
      },
    ];

    if (el("pending-enrollees-card")) steps.push({
      element: "#pending-enrollees-card",
      intro: `<strong>Pending Enrollees</strong><br/><br/>
        When a student selects a package and submits payment, they appear here waiting for your confirmation.<br/><br/>
        • Click <strong>Confirm</strong> once you've received their payment — this activates their package and lets them book classes.<br/>
        • Click <strong>Reject</strong> if the payment didn't go through.<br/><br/>
        If they uploaded a receipt or reference number, click the <strong>Receipt / Details</strong> button to verify it first.`,
      title: "Pending Enrollees",
    });

    if (el("todays-classes-card")) steps.push({
      element: "#todays-classes-card",
      intro: `<strong>Today's Classes</strong><br/><br/>
        All classes scheduled for today appear here. You can see the student, time, teacher, and status at a glance.<br/><br/>
        After a class is done, the teacher will:<br/>
        • Mark the student's attendance (present or absent)<br/>
        • Write a short class report<br/><br/>
        This is recorded in the student's Class History and affects their sessions remaining count.`,
      title: "Today's Classes & Attendance",
    });

    if (el("trial-banner")) steps.push({
      element: "#trial-banner",
      intro: `<strong>Free Trial</strong><br/><br/>
        Your account is on a <strong>30-day free trial</strong>. This banner shows how many days you have left.<br/><br/>
        When the trial ends, your account will be locked and your students won't be able to log in.<br/><br/>
        To avoid interruption, contact Brightfolks before the trial expires to upgrade to a paid plan.`,
      title: "Trial Period",
    });

    return steps;
  }

  // ── B: Packages page ─────────────────────────────────────────────────────
  if (segment === "B") {
    const steps: object[] = [];

    if (el("btn-add-package")) steps.push({
      element: "#btn-add-package",
      intro: `<strong>Add Package</strong><br/><br/>
        Click here to create a class package. Fill in:<br/>
        • <strong>Package Name</strong> — e.g. "Basic English 10"<br/>
        • <strong>Subject</strong> — e.g. English Conversation, Math<br/>
        • <strong>Number of Sessions</strong> — how many classes the student gets<br/>
        • <strong>Duration</strong> — 25, 50, 75, or 100 minutes per session<br/>
        • <strong>Price & Currency</strong><br/><br/>
        You can create as many packages as you need for different subjects or levels.`,
      title: "Create a Class Package",
    });

    if (el("company-settings-card")) steps.push({
      element: "#company-settings-card",
      intro: `<strong>Company Settings</strong><br/><br/>
        This section controls how your school operates. Scroll down to see all settings.`,
      title: "Company Settings",
    });

    if (el("company-settings-card")) steps.push({
      element: "#company-settings-card",
      intro: `🎓 <strong>Allow students to pick their teacher</strong><br/><br/>
        When <strong>ON</strong> — students choose a teacher themselves during enrollment.<br/>
        When <strong>OFF</strong> — you (the admin) assign a teacher to each student.`,
      title: "Teacher Picker Setting",
    });

    if (el("company-settings-card")) steps.push({
      element: "#company-settings-card",
      intro: `📋 <strong>Class adjustment visibility</strong><br/><br/>
        When <strong>ON</strong> — students can see any sessions you've added or deducted (with your reason) in their Student Record.<br/>
        When <strong>OFF</strong> — only their package purchase history is shown to them.`,
      title: "Adjustment Visibility",
    });

    if (el("company-settings-card")) steps.push({
      element: "#company-settings-card",
      intro: `⏱ <strong>Cancellation Policy</strong><br/><br/>
        Set how many hours before a class students or teachers can still cancel.<br/>
        Set to <strong>0</strong> to allow cancellation at any time.<br/><br/>
        You can also enable a <strong>penalty warning</strong> shown to teachers who cancel within the window.`,
      title: "Cancellation Policy",
    });

    if (el("payment-method-card")) steps.push({
      element: "#payment-method-card",
      intro: `💳 <strong>Direct to Encasher</strong><br/><br/>
        Students pay via an <strong>Alipay QR code</strong> managed by Brightfolks' payment partner.<br/><br/>
        This is useful if you <strong>cannot receive Chinese payments directly</strong>. The money is collected and forwarded to you. Contact Brightfolks to enable this option.`,
      title: "Payment via Encasher",
    });

    if (el("payment-method-card")) steps.push({
      element: "#payment-method-card",
      intro: `💬 <strong>Via WeChat, Zalo, or other platforms</strong><br/><br/>
        Students are shown a message telling them to contact you directly (via your preferred messaging app) to arrange payment.<br/><br/>
        Simple and flexible — no third party involved.`,
      title: "Payment via Messaging",
    });

    return steps;
  }

  // ── C: Teachers list page ────────────────────────────────────────────────
  if (segment === "C") {
    const steps: object[] = [];

    if (el("btn-add-teacher")) steps.push({
      element: "#btn-add-teacher",
      intro: `<strong>Add Teacher</strong><br/><br/>
        Click here to create a teacher account.<br/>
        Set their name, email, and a temporary password, then share those credentials with them so they can log in.`,
      title: "Add a Teacher",
    });

    steps.push({
      intro: `<strong>Teacher Profile</strong><br/><br/>
        Click any teacher's name to open their profile.<br/><br/>
        The next steps will show you everything on a teacher's profile page.`,
      title: "Opening a Teacher Profile",
    });

    return steps;
  }

  // ── D: Students list page ────────────────────────────────────────────────
  if (segment === "D") {
    const steps: object[] = [];

    if (el("btn-add-student")) steps.push({
      element: "#btn-add-student",
      intro: `<strong>Add Student</strong><br/><br/>
        Click here to register a student. Set their name, email, and a login password.<br/><br/>
        After saving, a popup will show their full credentials — use the <strong>Copy</strong> button and send it to them via chat or message.`,
      title: "Add a Student",
    });

    if (document.querySelector(".student-copy-btn")) steps.push({
      element: ".student-copy-btn",
      intro: `<strong>Copy Credentials</strong><br/><br/>
        Click this button to copy the student's login details to your clipboard (name, email, password, and the login link).<br/><br/>
        Paste and send it to them via WeChat, Zalo, email, or any messaging app.`,
      title: "Send Credentials",
    });

    steps.push({
      intro: `<strong>Student Profile</strong><br/><br/>
        Click any student's name to open their full profile.<br/><br/>
        The next steps will show you everything you can do from there.`,
      title: "Opening a Student Profile",
    });

    return steps;
  }

  // ── E: Teacher profile page ──────────────────────────────────────────────
  if (segment === "E") {
    const steps: object[] = [];

    if (el("teacher-btn-edit")) steps.push({
      element: "#teacher-btn-edit",
      intro: `<strong>Edit Teacher</strong><br/><br/>
        Update the teacher's name or email address here.`,
      title: "Edit Teacher Info",
    });

    if (el("teacher-btn-reset-pw")) steps.push({
      element: "#teacher-btn-reset-pw",
      intro: `<strong>Reset Password</strong><br/><br/>
        If the teacher forgets their password, set a new one here and share it with them.`,
      title: "Reset Password",
    });

    if (el("teacher-performance-card")) steps.push({
      element: "#teacher-performance-card",
      intro: `<strong>Performance Overview</strong><br/><br/>
        Shows key stats for this teacher:<br/>
        • Completed classes this week (25-min and 50-min separately)<br/>
        • Total completed classes all-time<br/>
        • Student absence count<br/>
        • Classes this month<br/><br/>
        Click any stat card to see the full list of classes behind that number. You can also filter by a custom date range.`,
      title: "Performance Overview",
    });

    if (el("teacher-attendance-card")) steps.push({
      element: "#teacher-attendance-card",
      intro: `<strong>Attendance Health</strong><br/><br/>
        Shows the teacher's overall attendance rate as a percentage, with a progress bar.<br/><br/>
        Breaks down: total classes, how many the student attended, and how many the student was absent for.`,
      title: "Attendance Health",
    });

    if (el("teacher-schedule-card")) steps.push({
      element: "#teacher-schedule-card",
      intro: `<strong>Upcoming Schedule</strong><br/><br/>
        A list of all this teacher's upcoming classes.<br/><br/>
        You can filter by student name, date range, or session duration to find specific classes quickly.`,
      title: "Upcoming Schedule",
    });

    if (el("teacher-availability-card")) steps.push({
      element: "#teacher-availability-card",
      intro: `⚠️ <strong>Do this first — Weekly Availability</strong><br/><br/>
        This grid controls when students can book this teacher.<br/><br/>
        🟢 <strong>Green</strong> = open — students can book this slot<br/>
        🔵 <strong>Blue</strong> = already booked by a student<br/>
        ⚫ <strong>Gray</strong> = closed — not available<br/><br/>
        <strong>All slots start gray (closed).</strong> Click a slot to open it. Until at least one slot is open, students cannot book any classes with this teacher.<br/><br/>
        Teachers can also open their own slots after logging in.`,
      title: "Weekly Availability — Open Slots First!",
    });

    if (el("teacher-leave-card")) steps.push({
      element: "#teacher-leave-card",
      intro: `<strong>Leave Requests</strong><br/><br/>
        When a teacher submits a leave request, it appears here with the date, reason, and status (pending / approved / rejected).<br/><br/>
        You can review and act on leave requests from this section.`,
      title: "Leave Requests",
    });

    return steps;
  }

  // ── F: Student profile page ──────────────────────────────────────────────
  if (segment === "F") {
    const steps: object[] = [];

    if (el("student-btn-edit")) steps.push({
      element: "#student-btn-edit",
      intro: `<strong>Edit Student</strong><br/><br/>
        Update the student's name, email, guardian name, nationality, or age.`,
      title: "Edit Student Info",
    });

    if (el("student-btn-reset-pw")) steps.push({
      element: "#student-btn-reset-pw",
      intro: `<strong>Reset Password</strong><br/><br/>
        If the student forgets their password, set a new one here and share it with them.`,
      title: "Reset Password",
    });

    if (el("student-btn-deactivate")) steps.push({
      element: "#student-btn-deactivate",
      intro: `<strong>Deactivate / Reactivate</strong><br/><br/>
        Deactivating a student prevents them from logging in without deleting their data.<br/>
        You can reactivate them at any time.`,
      title: "Deactivate Student",
    });

    if (el("student-package-card")) steps.push({
      element: "#student-package-card",
      intro: `<strong>Active Package</strong><br/><br/>
        This shows the student's current class package — the subject, sessions remaining, and payment status.<br/><br/>
        A student must have an active package before they can book any classes.`,
      title: "Active Package",
    });

    if (el("student-btn-assign-package")) steps.push({
      element: "#student-btn-assign-package",
      intro: `<strong>Assign New Package</strong><br/><br/>
        Click here to give the student a new class package.<br/><br/>
        You can also assign a teacher at the same time so they're linked from the start.`,
      title: "Assign Package",
    });

    if (el("student-btn-add-sessions")) steps.push({
      element: "#student-btn-add-sessions",
      intro: `<strong>Add Sessions</strong><br/><br/>
        Click the <strong>green +</strong> to manually add sessions to the student's count.<br/><br/>
        Use this for makeup classes, free trial sessions, or any other reason. You'll be asked to provide a reason which is recorded in the Student Record.`,
      title: "Add Sessions",
    });

    if (el("student-btn-deduct-sessions")) steps.push({
      element: "#student-btn-deduct-sessions",
      intro: `<strong>Deduct Sessions</strong><br/><br/>
        Click the <strong>red −</strong> to manually remove sessions from the student's count.<br/><br/>
        Use this for penalties, corrections, or other adjustments. A reason is required.`,
      title: "Deduct Sessions",
    });

    if (el("student-btn-assign-teacher")) steps.push({
      element: "#student-btn-assign-teacher",
      intro: `<strong>Assign Teacher</strong><br/><br/>
        Links a specific teacher to this student.<br/><br/>
        Once assigned, the student will only see <em>that teacher's</em> available slots when booking a class — they won't see other teachers' schedules.`,
      title: "Assign Teacher",
    });

    if (el("student-btn-adj-history")) steps.push({
      element: "#student-btn-adj-history",
      intro: `<strong>Adjustment History</strong><br/><br/>
        View a full log of every session that was manually added or deducted for this student — including the reason and who made the change.`,
      title: "Adjustment History",
    });

    if (el("student-history-card")) steps.push({
      element: "#student-history-card",
      intro: `<strong>Class History</strong><br/><br/>
        A full record of all this student's classes — past and upcoming.<br/><br/>
        Filter by month, year, status (pending / confirmed / done / cancelled), or attendance (present / absent).<br/><br/>
        For completed classes, click <strong>View Report</strong> to see the teacher's class report and the attendance mark for that session.`,
      title: "Class History",
    });

    if (el("student-history-card")) steps.push({
      element: "#student-history-card",
      intro: `📋 <strong>How Attendance Works</strong><br/><br/>
        After each class ends, the teacher marks the student as <strong>Present</strong> or <strong>Absent</strong> and writes a short class report.<br/><br/>
        • <strong>Present</strong> — the session is deducted from the student's remaining count as normal.<br/>
        • <strong>Absent (no show)</strong> — the session is still counted as used.<br/><br/>
        You can see the full attendance breakdown on the teacher's profile page.`,
      title: "Attendance & Class Reports",
    });

    if (el("student-btn-add-class")) steps.push({
      element: "#student-btn-add-class",
      intro: `📅 <strong>Add Class — One by One</strong><br/><br/>
        Book a class on behalf of the student by picking a specific date and time from the teacher's open slots.<br/><br/>
        Use this when the student wants a one-off session or you're booking a few classes manually.<br/><br/>
        The slot must be open (green) on the teacher's availability grid for it to appear as an option.`,
      title: "Add Class — One by One",
    });

    if (el("student-btn-add-class")) steps.push({
      element: "#student-btn-add-class",
      intro: `🔁 <strong>Add Class — Recurring Schedule</strong><br/><br/>
        The most powerful booking mode. Set:<br/>
        • <strong>Day of the week</strong> — e.g. every Tuesday<br/>
        • <strong>Start time</strong> — e.g. 9:00 AM<br/>
        • <strong>Number of weeks</strong> — e.g. 8 weeks<br/><br/>
        The system creates all 8 classes at once. If the student ever wants to cancel just one session, they can — it won't affect the rest of the series.`,
      title: "Add Class — Recurring Schedule",
    });

    if (el("student-btn-bulk-assign")) steps.push({
      element: "#student-btn-bulk-assign",
      intro: `<strong>Bulk Assign Classes</strong><br/><br/>
        If the student has no teacher assigned yet, use this to assign a teacher to <em>all</em> their existing pending or confirmed classes at once — instead of updating them one by one.`,
      title: "Bulk Assign Teacher",
    });

    return steps;
  }

  return [];
}

// Logical page order: Dashboard → Packages → Teachers list → Teacher profile → Students list → Student profile
const nextSegment: Record<TourSegment, TourSegment | "done"> = {
  A: "B",
  B: "C",
  C: "E",  // Teachers list → Teacher profile
  E: "D",  // Teacher profile → Students list
  D: "F",  // Students list → Student profile
  F: "done",
};

function buildIntro(steps: object[], onComplete: () => void, onEarlyExit: () => void = () => {}) {
  let completed = false;
  return introJs()
    .setOptions({
      steps,
      showProgress: true,
      showBullets: false,
      exitOnOverlayClick: false,
      scrollToElement: true,
      nextLabel: "Next →",
      prevLabel: "← Back",
      doneLabel: "Got it!",
      tooltipClass: "brightfolks-tour",
    })
    .oncomplete(() => { completed = true; onComplete(); })
    .onexit(() => { if (!completed) onEarlyExit(); });
}

function navigateForSegment(segment: TourSegment, navigate: ReturnType<typeof useNavigate>) {
  if (segment === "A") {
    navigate("/packages");
  } else if (segment === "B") {
    navigate("/teachers");
  } else if (segment === "C") {
    // Click the first teacher's Profile button; if none exist, user navigates manually
    const btn = document.querySelector('[data-tour-action="view-teacher"]') as HTMLElement | null;
    if (btn) btn.click();
  } else if (segment === "E") {
    navigate("/students");
  } else if (segment === "D") {
    // Click the first student's View button; if none exist, user navigates manually
    const btn = document.querySelector('[data-tour-action="view-student"]') as HTMLElement | null;
    if (btn) btn.click();
  }
}

export function AdminTour({ segment, companyId, autoStart = false }: Props) {
  const tour = useTour(companyId);
  const navigate = useNavigate();
  const started = useRef(false);

  const startTour = () => {
    const steps = getSteps(segment);
    if (!steps.length) return;

    buildIntro(
      steps,
      () => {
        // Completed all steps — advance segment and navigate to next page
        const next = nextSegment[segment];
        if (next === "done") {
          tour.markDone();
        } else {
          tour.setSegment(next);
          navigateForSegment(segment, navigate);
        }
      },
      () => {
        // Early exit (Escape / X) — keep segment so user can resume later
      }
    ).start();
  };

  useEffect(() => {
    if (!autoStart) return;
    if (tour.isCompleted()) return;
    if (tour.getSegment() !== segment) return;
    if (started.current) return;
    started.current = true;

    const t = setTimeout(startTour, 700);
    return () => clearTimeout(t);
  }, []);

  return null;
}

export function useStartTour(segment: TourSegment, companyId: number) {
  const tour = useTour(companyId);
  const navigate = useNavigate();
  return () => {
    tour.resetTour();
    setTimeout(() => {
      const steps = getSteps(segment);
      if (!steps.length) return;
      buildIntro(steps, () => {
        tour.setSegment("B");
        navigate("/packages");
      }).start();
    }, 100);
  };
}
