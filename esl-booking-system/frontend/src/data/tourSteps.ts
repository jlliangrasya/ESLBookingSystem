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

export const NEXT_SEGMENT: Record<string, string | "done"> = {
  A: "B",
  B: "C",
  C: "D",
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
        content: `This quick interactive tour will walk you through everything you need to get your school up and running:<br/><br/>
          📦 <strong>Packages</strong> — Create your class packages &amp; configure school settings<br/>
          👩‍🏫 <strong>Teachers</strong> — Add teachers and set their availability<br/>
          🎓 <strong>Students</strong> — Register students, assign packages, and book classes<br/><br/>
          At each step, you'll be asked to <strong>actually click the button</strong> — just follow the arrows!`,
      },
      {
        type: "explain",
        id: "A-packages",
        targetSelector: "#nav-packages",
        title: "Step 1 — Class Packages",
        content: `Before you can enroll a student, you need at least one <strong>class package</strong>.<br/><br/>
          A package defines the subject, number of sessions, duration per class, and price.<br/><br/>
          You'll also set up your <strong>company settings</strong> and <strong>payment method</strong> here.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-teachers",
        targetSelector: "#nav-teachers",
        title: "Step 2 — Teachers",
        content: `Add your teachers here. Each teacher gets their own login account to manage their schedule and view classes.<br/><br/>
          ⚠️ <strong>Critical:</strong> After adding a teacher, open their <strong>weekly availability slots</strong> on their profile page. Students can only book into open (green) slots.`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-students",
        targetSelector: "#nav-students",
        title: "Step 3 — Students",
        content: `Register your students here. You set their login credentials and share them.<br/><br/>
          <strong>Student booking flow:</strong><br/>
          1️⃣ Student browses packages and selects one<br/>
          2️⃣ They submit payment<br/>
          3️⃣ You confirm their payment on the dashboard<br/>
          4️⃣ They can then pick an available slot and book a class`,
        placement: "bottom",
      },
      {
        type: "explain",
        id: "A-dashboard",
        targetSelector: "#nav-admin-dashboard",
        title: "Step 4 — Dashboard",
        content: `Your command center. It shows:<br/>
          • Today's scheduled classes<br/>
          • Students waiting for payment confirmation<br/>
          • Teacher workload overview<br/>
          • Analytics and growth charts<br/><br/>
          You can also book classes on behalf of students directly from their profile.`,
        placement: "bottom",
      },
    ],
  },

  // ── B: Packages page ─────────────────────────────────────────────────────
  {
    id: "B",
    steps: [
      {
        type: "action",
        id: "B-add-package",
        targetSelector: "#btn-add-package",
        title: "Create Your First Package",
        content: `Every student enrollment needs a <strong>class package</strong>. Let's create your first one now.`,
        actionHint: "Click the Add Package button to continue",
        placement: "bottom",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "B-fill-package",
        title: "Fill In Package Details",
        content: `Fill in the following fields:<br/><br/>
          • <strong>Package Name</strong> — e.g. "Basic English 10"<br/>
          • <strong>Subject</strong> — e.g. English Conversation, Math<br/>
          • <strong>Number of Sessions</strong> — how many classes the student gets<br/>
          • <strong>Duration</strong> — 25, 50, 75, or 100 minutes per session<br/>
          • <strong>Price &amp; Currency</strong><br/><br/>
          You can create as many packages as you need. Click <strong>Save</strong> in the dialog when done.`,
      },
      {
        type: "explain",
        id: "B-settings-overview",
        targetSelector: "#company-settings-card",
        title: "Company Settings",
        content: `This section controls how your school operates. Let's walk through each setting so you know exactly what they do.`,
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
        title: "Add Your First Teacher",
        content: `Let's add a teacher account. You'll set their name, email, and a temporary password, then share those credentials with them so they can log in.`,
        actionHint: "Click the Add Teacher button to continue",
        placement: "bottom",
        waitForElement: "[role=dialog]",
        waitTimeout: 10000,
      },
      {
        type: "explain",
        id: "C-fill-teacher",
        title: "Fill In Teacher Details",
        content: `Fill in the teacher's information:<br/><br/>
          • <strong>Full Name</strong><br/>
          • <strong>Email Address</strong> — this is their login username<br/>
          • <strong>Password</strong> — set a temporary password they can change later<br/><br/>
          Click <strong>Add Teacher</strong> in the dialog when you're done.`,
      },
      {
        type: "action",
        id: "C-confirm-teacher",
        targetSelector: "[role=dialog] button[type=submit], [role=dialog] button.add-teacher-submit",
        title: "Save the Teacher",
        content: `When you're happy with the details, click the <strong>Add Teacher</strong> button inside the dialog to save.`,
        actionHint: "Click Add Teacher in the dialog to save",
        placement: "top",
        waitForElement: ".teacher-profile-btn",
        waitTimeout: 10000,
      },
      {
        type: "action",
        id: "C-open-profile",
        targetSelector: ".teacher-profile-btn",
        title: "Open the Teacher's Profile",
        content: `Great, the teacher has been added! Now let's open their profile to explore what you can manage from there.`,
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
        title: "Send Teacher Login Credentials",
        content: `✉️ <strong>Don't forget!</strong><br/><br/>
          Send the teacher their login credentials via WeChat, Zalo, email, or any messaging app:<br/><br/>
          • <strong>Login URL:</strong> your school's link<br/>
          • <strong>Email:</strong> what you just entered<br/>
          • <strong>Password:</strong> the temporary password you set<br/><br/>
          The teacher can log in and start managing their availability right away.`,
      },
    ],
  },

  // ── D: Students page ─────────────────────────────────────────────────────
  {
    id: "D",
    steps: [
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
        content: `You've completed the Brightfolks setup tour!<br/><br/>
          Here's a quick recap of what's next:<br/><br/>
          1. <strong>Open teacher availability</strong> — go to each teacher's profile and turn on their time slots<br/>
          2. <strong>Share student logins</strong> — send credentials so students can log in and select packages<br/>
          3. <strong>Confirm payments</strong> — once a student submits payment, confirm it on your dashboard<br/>
          4. <strong>Book classes!</strong> — schedule recurring sessions for consistent learning<br/><br/>
          Good luck with your school! 🚀`,
      },
    ],
  },
];
