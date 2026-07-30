export type BubblePlacement = "top" | "bottom" | "left" | "right" | "center";

export interface ExplainStep {
  type: "explain";
  id: string;
  targetSelector?: string;
  title: string;
  content: string;
  placement?: BubblePlacement;
}

export interface ActionStep {
  type: "action";
  id: string;
  targetSelector: string;
  title: string;
  content: string;
  actionHint: string;
  placement?: BubblePlacement;
  waitForElement?: string;
  waitTimeout?: number;
}

export type TourStep = ExplainStep | ActionStep;

export interface TourSegmentDef {
  id: string;
  steps: TourStep[];
}

/**
 * Segment IDs are bound to pages by the <AdminTour segment="…"> mounted on each
 * one, so they can't be renamed without touching those pages:
 *
 *   A → AdminDashboard      B → PackageSetupPage
 *   C → TeacherManagement   D → StudentList
 *
 * The ORDER of the tour is defined here, not by the letters. Onboarding is now
 * teacher-first — a company should meet one teacher and one package before
 * anything else — so the chain runs A → C (teachers) → B (packages) → D
 * (students), which is why C precedes B below.
 */
export const NEXT_SEGMENT: Record<string, string | "done"> = {
  A: "C",
  C: "B",
  B: "D",
  D: "done",
};

export const TOUR_SEGMENTS: TourSegmentDef[] = [
  // ── A: Dashboard intro ────────────────────────────────────────────────────
  {
    id: "A",
    steps: [
      {
        type: "explain",
        id: "A-welcome",
        title: "Welcome to Brightfolks! 🎉",
        content: `Let's get one class on the board — that's it for now.<br/><br/>
          👩‍🏫 <strong>Add one teacher</strong> — just a name and an email<br/>
          📦 <strong>Pick a package</strong> — choose a ready-made one<br/>
          ✨ <strong>Your teacher logs in</strong> — and sees their class<br/><br/>
          Two minutes, two steps. Everything else — the rest of your team, your
          students, custom pricing — can wait until after.`,
      },
      {
        type: "explain",
        id: "A-teachers",
        targetSelector: "#nav-teachers",
        title: "Step 1 — Add your first teacher",
        content: `Start here. Add <strong>one</strong> teacher to see Brightfolks in action.<br/><br/>
          All we need is their <strong>name and email</strong> — no bio, no photo, no
          schedule. They'll get an invite and can log in straight away.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-packages",
        targetSelector: "#nav-packages",
        title: "Step 2 — Pick a package",
        content: `A package is what a student buys — a subject, a number of
          sessions, and a price.<br/><br/>
          You don't have to design one. <strong>Pick a ready-made package</strong> and
          you're done; you can rename it and set your own pricing anytime.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-students",
        targetSelector: "#nav-students",
        title: "Later — Your students",
        content: `Once your teacher is in, come back here to invite students.<br/><br/>
          🔒 Inviting <em>real</em> students needs a one-time account review — that's
          how we protect student data. It usually takes under 24 hours, and you can
          prepare your roster while you wait.<br/><br/>
          Nothing before this step waits on us.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-dashboard",
        targetSelector: "#nav-admin-dashboard",
        title: "Your dashboard",
        content: `Your command center, and where your setup progress lives.<br/><br/>
          • Today's scheduled classes<br/>
          • Students waiting for payment confirmation<br/>
          • Teacher workload overview<br/>
          • Analytics and growth charts<br/><br/>
          The progress bar at the top of every page tracks the steps above.`,
        placement: "bottom",
      },
    ],
  },

  // ── B: Packages page ─────────────────────────────────────────────────────
  {
    id: "B",
    steps: [
      {
        // Deliberately an "explain", not an "action". The template picker only
        // renders while the company has zero packages, and action steps have no
        // Next button (see TourBubble) — so a company that already created a
        // package would hit an unadvanceable step with no way out but quitting
        // the tour. "explain" keeps Next available whether or not the picker is
        // on screen.
        type: "explain",
        id: "B-pick-template",
        targetSelector: ".template-pick-btn",
        title: "Pick a package to get started",
        content: `A package is what a student buys. You don't need to design one from
          scratch — pick whichever of these is closest to how you teach, then hit
          <strong>Use this</strong>.<br/><br/>
          <strong>You can customise it anytime</strong>: rename it, change the
          session count, set your own price. Nothing here is permanent.<br/><br/>
          Already have a package? You're done with this step — hit Next.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "B-customise-later",
        title: "That's the required setup done 🎉",
        content: `You have a teacher and a package — that's everything Brightfolks
          needs to work.<br/><br/>
          Want something more specific? <strong>Build a custom package</strong> lets
          you set the subject, session count, duration, price, and currency exactly
          how you want. Do that whenever it suits you — it isn't a first-day job.<br/><br/>
          The rest of this tour covers your school's settings. Useful, but entirely
          optional — exit any time.`,
      },
      {
        type: "explain",
        id: "B-settings-overview",
        targetSelector: "#company-settings-card",
        title: "Company Settings (optional)",
        content: `These control how your school operates. Sensible defaults are
          already set, so you can skip this and come back later.<br/><br/>
          Here's what each one does, in case you want to change them now.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "B-teacher-picker",
        targetSelector: "#company-settings-card",
        title: "Allow Students to Select Their Own Teacher",
        content: `🎓 <strong>Allow students to pick their teacher</strong><br/><br/>
          <strong>ON</strong> — students choose a teacher themselves during enrollment.<br/>
          <strong>OFF</strong> — you (the admin) assign a teacher to each student.<br/><br/>
          Most schools start with this <strong>OFF</strong> so they control teacher assignments.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "B-adj-visibility",
        targetSelector: "#company-settings-card",
        title: "Class Adjustment Visibility",
        content: `📋 <strong>Class adjustment visibility</strong><br/><br/>
          <strong>ON</strong> — students can see any sessions you've added or deducted (with your reason) in their Student Record.<br/>
          <strong>OFF</strong> — only their package purchase history is shown to them.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "B-cancellation",
        targetSelector: "#company-settings-card",
        title: "Cancellation Policy",
        content: `⏱ <strong>Cancellation Policy</strong><br/><br/>
          Set how many hours before a class a student or teacher can still cancel without penalty.<br/>
          Set to <strong>0</strong> to allow cancellation at any time.<br/><br/>
          This protects both teachers and students from last-minute no-shows.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "B-penalty",
        targetSelector: "#company-settings-card",
        title: "Penalty Notice for Late Teacher Cancellations",
        content: `⚠️ <strong>Penalty notice</strong><br/><br/>
          When enabled, teachers who cancel within the cancellation window will see a <strong>penalty warning</strong> reminding them of the school's policy.<br/><br/>
          This is a notice only — no automatic deduction is applied.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "B-payment",
        targetSelector: "#payment-method-card",
        title: "Payment Method",
        content: `💳 <strong>How students pay you</strong><br/><br/>
          <strong>Alipay QR (via Encasher)</strong> — Students pay via a QR code managed by Brightfolks' payment partner. Useful if you can't receive Chinese payments directly.<br/><br/>
          <strong>Via WeChat / Zalo / other</strong> — Students are shown a message telling them to contact you directly to arrange payment. Simple and flexible — no third party involved.`,
        placement: "top",
      },
      {
        type: "action",
        id: "B-save-settings",
        targetSelector: "#btn-save-settings",
        title: "Save Your Settings",
        content: `You've reviewed all the company settings. Now make sure to <strong>save them</strong> so your preferences are applied.`,
        actionHint: "Click Save Settings to continue",
        placement: "top",
      },
    ],
  },

  // ── C: Teachers page ──────────────────────────────────────────────────────
  {
    id: "C",
    steps: [
      {
        type: "action",
        id: "C-add-teacher",
        targetSelector: "#btn-add-teacher",
        title: "Add your first teacher to see Brightfolks in action",
        content: `One teacher is all it takes. We'll send them an invite so they can
          log in — no password for you to invent.`,
        actionHint: "Click the Add Teacher button to continue",
        placement: "bottom",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "C-fill-teacher",
        title: "Two fields, that's it",
        content: `Fill in the teacher's:<br/><br/>
          • <strong>Full Name</strong><br/>
          • <strong>Email Address</strong> — this is their login username<br/><br/>
          That's everything we need. We'll generate a temporary password, email
          them an invite, and show you the details in case you'd rather send them
          yourself.<br/><br/>
          Bio, photo, and schedule all live on their profile — add those whenever.`,
      },
      {
        type: "action",
        id: "C-confirm-teacher",
        targetSelector: "[role=dialog] button[type=submit], [role=dialog] button.add-teacher-submit",
        title: "Save the Teacher",
        content: `When you're happy with the details, click the <strong>Add Teacher</strong> button inside the dialog to save.`,
        actionHint: "Click Add Teacher in the dialog to save",
        placement: "top",
        waitForElement: ".teacher-invite-copy-btn, .teacher-profile-btn",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "C-invite-sent",
        title: "Invite sent ✉️",
        content: `Your teacher has been emailed their login details.<br/><br/>
          The message is also shown on screen — hit <strong>Copy invite</strong> if
          you'd rather send it over WeChat, Zalo, or any chat app. That's often
          faster than waiting on email.<br/><br/>
          The moment they log in, your setup milestone is complete.<br/><br/>
          <em>Close the dialog when you're done copying, then hit Next.</em>`,
      },
      {
        type: "action",
        id: "C-open-profile",
        targetSelector: ".teacher-profile-btn",
        title: "Optional — look around their profile",
        content: `Your teacher is set up, so the required part is done.<br/><br/>
          If you'd like a quick look at what you can manage for them, open their
          profile. Otherwise feel free to exit the tour here.`,
        actionHint: "Click Profile to open this teacher's profile",
        placement: "left",
      },
      {
        type: "explain",
        id: "C-edit",
        targetSelector: "#teacher-btn-edit",
        title: "Edit Teacher Info",
        content: `Click here to update the teacher's <strong>name</strong> or <strong>email address</strong> at any time.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "C-reset-pw",
        targetSelector: "#teacher-btn-reset-pw",
        title: "Reset Password",
        content: `If the teacher forgets their password, set a new one here and share it with them. They can change it after logging in.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "C-performance",
        targetSelector: "#teacher-performance-card",
        title: "Performance Overview",
        content: `Shows key stats for this teacher:<br/>
          • Completed classes this week (25-min and 50-min)<br/>
          • Total completed classes all-time<br/>
          • Student absence count<br/>
          • Classes this month<br/><br/>
          Click any stat card to drill into the full list with date filters.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "C-attendance",
        targetSelector: "#teacher-attendance-card",
        title: "Attendance Health",
        content: `Shows the teacher's overall <strong>student attendance rate</strong> as a percentage.<br/><br/>
          Breaks down: total classes, how many students attended, and how many were absent.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "C-schedule",
        targetSelector: "#teacher-schedule-card",
        title: "Upcoming Schedule",
        content: `A list of all this teacher's upcoming classes.<br/><br/>
          Filter by student name, date range, or session duration to find specific classes quickly.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "C-availability",
        targetSelector: "#teacher-availability-card",
        title: "⚠️ Weekly Availability — Do This First!",
        content: `This grid controls when students can book this teacher.<br/><br/>
          🟢 <strong>Green</strong> = open — students can book this slot<br/>
          🔵 <strong>Blue</strong> = already booked<br/>
          ⚫ <strong>Gray</strong> = closed — not available<br/><br/>
          <strong>All slots start gray.</strong> Click a slot to open it. Until at least one slot is open, <strong>no one can book this teacher.</strong><br/><br/>
          Teachers can also open their own slots after logging in.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "C-leave",
        targetSelector: "#teacher-leave-card",
        title: "Leave Requests",
        content: `When a teacher submits a leave request, it appears here with the date, reason, and status.<br/><br/>
          You can <strong>approve</strong> or <strong>reject</strong> leave requests from this section.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "C-credentials",
        title: "Next: pick a package",
        content: `Your teacher is invited and can log in.<br/><br/>
          One more step and you're done: <strong>pick a class package</strong> so
          there's something for students to enroll in. We'll head there next.<br/><br/>
          If a teacher ever loses their password, use <strong>Reset Password</strong>
          on their profile and send them the new one.`,
      },
    ],
  },

  // ── D: Students page ─────────────────────────────────────────────────────
  {
    id: "D",
    steps: [
      {
        type: "explain",
        id: "D-approval-note",
        title: "One thing before you invite students",
        content: `🔒 To protect student data, we manually review accounts before
          inviting <em>real</em> students. This usually takes <strong>under 24
          hours</strong>.<br/><br/>
          It's the only step that waits on us — registering, adding teachers, and
          setting up packages all worked immediately.<br/><br/>
          If you're not approved yet you'll be shown a checklist so you can prepare
          your roster now and submit it the moment you're cleared. We'll email you
          <em>and</em> send an in-app notification with a link straight back here.`,
      },
      {
        type: "action",
        id: "D-add-student",
        targetSelector: "#btn-add-student",
        title: "Add Your First Student",
        content: `Let's register a student. You'll set their name, email, and a login password, then share those credentials with them.`,
        actionHint: "Click the Add Student button to continue",
        placement: "bottom",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "D-fill-student",
        title: "Fill In Student Details",
        content: `Fill in the student's information:<br/><br/>
          • <strong>Full Name</strong><br/>
          • <strong>Email Address</strong> — their login username<br/>
          • <strong>Password</strong> — a temporary password<br/>
          • Optionally: guardian name, nationality, age<br/><br/>
          After saving, a popup will show their credentials — ready to copy and send!`,
      },
      {
        type: "action",
        id: "D-confirm-student",
        targetSelector: "[role=dialog] button[type=submit], [role=dialog] button.add-student-submit",
        title: "Save the Student",
        content: `When you're ready, click <strong>Add Student</strong> in the dialog to save. Their credentials will pop up automatically.`,
        actionHint: "Click Add Student in the dialog to save",
        placement: "top",
        waitForElement: ".student-copy-btn",
        waitTimeout: 10000,
      },
      {
        type: "action",
        id: "D-copy-credentials",
        targetSelector: ".student-copy-btn",
        title: "Copy Student Credentials",
        content: `This button copies the student's full login details to your clipboard:<br/><br/>
          • Name, email, password<br/>
          • Direct login link<br/><br/>
          Paste and send it to them via WeChat, Zalo, email, or any chat app.`,
        actionHint: "Click Copy to copy the student's credentials",
        placement: "top",
      },
      {
        type: "action",
        id: "D-open-profile",
        targetSelector: ".student-profile-btn",
        title: "Open the Student's Profile",
        content: `Now let's open the student's profile to see everything you can manage from there.`,
        actionHint: "Click View/Profile to open the student's profile",
        placement: "left",
      },
      {
        type: "explain",
        id: "D-edit",
        targetSelector: "#student-btn-edit",
        title: "Edit Student Info",
        content: `Update the student's name, email, guardian name, nationality, or age here at any time.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "D-reset-pw",
        targetSelector: "#student-btn-reset-pw",
        title: "Reset Password",
        content: `If the student forgets their password, set a new one here and share it with them.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "D-deactivate",
        targetSelector: "#student-btn-deactivate",
        title: "Deactivate / Reactivate",
        content: `Deactivating a student prevents them from logging in without deleting their data.<br/>
          You can reactivate them at any time.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "D-package",
        targetSelector: "#student-package-card",
        title: "Active Package",
        content: `Shows the student's current class package — subject, sessions remaining, and payment status.<br/><br/>
          A student must have an <strong>active package</strong> before they can book any classes.`,
        placement: "top",
      },
      {
        type: "action",
        id: "D-assign-package",
        targetSelector: "#student-btn-assign-package",
        title: "Assign a Package",
        content: `Let's assign a package to this student. You can also link a teacher at the same time so they're connected from the start.`,
        actionHint: "Click Assign Package to give this student a class package",
        placement: "top",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "D-assign-package-fill",
        title: "Select a Package",
        content: `Choose a package from the list and optionally assign a teacher.<br/><br/>
          Once you confirm, the student's package will be active and they'll be able to start booking classes.<br/><br/>
          Click <strong>Assign</strong> or <strong>Save</strong> in the dialog when done.`,
      },
      {
        type: "explain",
        id: "D-add-sessions",
        targetSelector: "#student-btn-add-sessions",
        title: "Add Sessions (Makeup / Bonus)",
        content: `Click the <strong>green +</strong> to manually add sessions to the student's count.<br/><br/>
          Use this for makeup classes, free trial sessions, or any other reason. A reason is required and is recorded in the Student Record.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "D-deduct-sessions",
        targetSelector: "#student-btn-deduct-sessions",
        title: "Deduct Sessions",
        content: `Click the <strong>red −</strong> to manually remove sessions from the student's count.<br/><br/>
          Use this for penalties, corrections, or other adjustments. A reason is always required.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "D-assign-teacher",
        targetSelector: "#student-btn-assign-teacher",
        title: "Assign a Teacher",
        content: `Links a specific teacher to this student.<br/><br/>
          Once assigned, the student will <em>only</em> see that teacher's available slots when booking — they won't see other teachers' schedules.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "D-adj-history",
        targetSelector: "#student-btn-adj-history",
        title: "Adjustment History",
        content: `View a full log of every session manually added or deducted for this student — including the reason and who made the change.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "D-class-history",
        targetSelector: "#student-history-card",
        title: "Class History",
        content: `A complete record of all this student's classes — past and upcoming.<br/><br/>
          Filter by month, year, status (pending / confirmed / done / cancelled), or attendance.<br/><br/>
          For completed classes, click <strong>View Report</strong> to see the teacher's class notes and attendance mark.`,
        placement: "top",
      },
      {
        type: "action",
        id: "D-add-class",
        targetSelector: "#student-btn-add-class",
        title: "Book a Class",
        content: `Let's book a class for this student! You can book one-by-one or set up a recurring weekly schedule.`,
        actionHint: "Click Add Class to book a session",
        placement: "top",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "D-add-class-types",
        title: "One-by-One vs. Recurring",
        content: `📅 <strong>One by One</strong> — Pick a specific date and time from the teacher's open slots. Great for one-off sessions.<br/><br/>
          🔁 <strong>Recurring</strong> — Set a day of the week, start time, and number of weeks. The system creates all classes at once. The student can still cancel individual sessions without affecting the rest.<br/><br/>
          Click <strong>Book</strong> or <strong>Save</strong> in the dialog when done.`,
      },
      {
        type: "explain",
        id: "D-bulk-assign",
        targetSelector: "#student-btn-bulk-assign",
        title: "Bulk Assign Teacher to Classes",
        content: `If the student has pending or confirmed classes with no teacher assigned yet, use this to assign a teacher to <em>all of them at once</em> — instead of updating one by one.`,
        placement: "top",
      },
      {
        type: "explain",
        id: "D-credentials",
        title: "Send Student Login Credentials",
        content: `✉️ <strong>You're almost done!</strong><br/><br/>
          If you haven't already, send the student their login credentials:<br/><br/>
          • <strong>Login URL:</strong> your school's link<br/>
          • <strong>Email:</strong> the email you registered<br/>
          • <strong>Password:</strong> the temporary password you set<br/><br/>
          Once they log in, they can browse packages, submit payment, and start booking classes!`,
      },
      {
        type: "explain",
        id: "D-tour-complete",
        title: "🎉 Tour Complete!",
        content: `You've seen the whole thing.<br/><br/>
          Your required setup was just two steps — <strong>one teacher</strong> and
          <strong>one package</strong>. Everything else is at your own pace:<br/><br/>
          1. <strong>Open teacher availability</strong> — students can only book slots you've opened<br/>
          2. <strong>Add the rest of your team</strong> — same two fields each time<br/>
          3. <strong>Invite your students</strong> — and confirm their payments on the dashboard<br/>
          4. <strong>Customise your packages</strong> — your own pricing, subjects, and session counts<br/><br/>
          Good luck with your school! 🚀`,
      },
    ],
  },
];
