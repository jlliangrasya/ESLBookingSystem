import { useContext, useState } from "react";
import { Navigate } from "react-router-dom";
import NavBar from "../components/Navbar";
import AuthContext from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Users,
  GraduationCap,
  CalendarDays,
  Package,
  BarChart2,
  Bell,
  Settings,
  Shield,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  UserCog,
  Star,
  AlertCircle,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  content: React.ReactNode;
}

const Callout = ({
  type,
  children,
}: {
  type: "tip" | "important" | "example";
  children: React.ReactNode;
}) => {
  const styles = {
    tip: {
      bg: "bg-blue-50 border-blue-200",
      icon: <Lightbulb className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />,
      label: "Tip",
      labelColor: "text-blue-700",
    },
    important: {
      bg: "bg-amber-50 border-amber-200",
      icon: <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />,
      label: "Important",
      labelColor: "text-amber-700",
    },
    example: {
      bg: "bg-green-50 border-green-200",
      icon: <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />,
      label: "Real-world example",
      labelColor: "text-green-700",
    },
  };
  const s = styles[type];
  return (
    <div className={`flex gap-2 border rounded-lg p-3 text-sm ${s.bg} mt-3`}>
      {s.icon}
      <div>
        <span className={`font-semibold ${s.labelColor}`}>{s.label}: </span>
        <span className="text-gray-700">{children}</span>
      </div>
    </div>
  );
};

const SectionBlock = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-3 text-sm text-gray-700 leading-relaxed">{children}</div>
);

const H3 = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-semibold text-gray-800 mt-4 mb-1">{children}</h3>
);

const UL = ({ items }: { items: string[] }) => (
  <ul className="list-disc list-inside space-y-1 pl-2">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

const sections: Section[] = [
  {
    id: "overview",
    icon: <BookOpen className="h-5 w-5" />,
    title: "System Overview",
    content: (
      <SectionBlock>
        <p>
          <strong>Brightfolks</strong> is a multi-tenant SaaS platform built for ESL (English as a Second Language)
          tutorial centers. Each registered ESL center operates as an independent company within the platform, with
          their own students, teachers, packages, and schedule — fully isolated from other companies.
        </p>
        <H3>Who is this for?</H3>
        <UL items={[
          "ESL school owners who want a centralized system to manage their operations",
          "Administrators who handle day-to-day scheduling and student management",
          "Teachers who need to track their classes and submit lesson reports",
          "Students who want to book sessions and monitor their progress",
        ]} />
        <Callout type="example">
          A small ESL center in Korea with 20 students and 3 teachers signs up for Brightfolks. The owner registers
          the company, gets approved by the super admin, and immediately starts adding students, assigning packages,
          and setting up teacher schedules — all without managing any server infrastructure.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "roles",
    icon: <Shield className="h-5 w-5" />,
    title: "User Roles & Permissions",
    content: (
      <SectionBlock>
        <p>The platform has four distinct user roles, each with specific capabilities:</p>

        <H3>Super Admin</H3>
        <p>The platform-level administrator. There is typically one super admin for the entire Brightfolks instance.</p>
        <UL items={[
          "Approve or reject company registrations",
          "Suspend or lock company accounts",
          "Manage subscription plans and pricing",
          "View platform-wide analytics (company growth, session totals)",
          "Handle upgrade requests from companies",
          "View all company audit logs",
        ]} />

        <H3>Company Owner (Admin)</H3>
        <p>The owner of a registered ESL center. Has full control over their company's data.</p>
        <UL items={[
          "All company_admin capabilities",
          "Create and manage sub-admin accounts",
          "Set sub-admin permissions (add/edit/delete teachers)",
          "Access company analytics dashboard",
          "Manage company settings (QR code, cancellation policy, teacher-picker toggle)",
          "View company audit logs",
          "Access this documentation",
        ]} />

        <H3>Sub-Admin (Company Admin)</H3>
        <p>Staff members the owner delegates administrative tasks to, with limited permissions.</p>
        <UL items={[
          "Manage students (add, view profiles, assign packages)",
          "Manage teachers (depending on granted permissions)",
          "Confirm or cancel bookings",
          "View the weekly schedule and reports",
        ]} />

        <H3>Teacher</H3>
        <UL items={[
          "View their own upcoming and completed class schedule",
          "Submit class reports after each session",
          "Request leave days",
          "Block/unblock personal availability slots",
          "Edit their own profile and timezone",
        ]} />

        <H3>Student</H3>
        <UL items={[
          "Browse and enroll in tutorial packages",
          "Book available timeslots",
          "View their class calendar and report history",
          "Cancel bookings (subject to cancellation policy)",
          "Edit their profile and timezone",
        ]} />

        <Callout type="tip">
          Sub-admins cannot create other sub-admins or change company settings. Only the company owner can do
          those actions.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "company-setup",
    icon: <Settings className="h-5 w-5" />,
    title: "Company Setup & Onboarding",
    badge: "Start here",
    content: (
      <SectionBlock>
        <H3>Step 1 — Register your company</H3>
        <p>
          Go to the <strong>Register Your ESL Center</strong> link on the home page. Fill in your company name,
          your owner account details, and choose a subscription plan. A <strong>Free Trial</strong> plan is
          available (30 days, up to 2 students, 1 teacher, 1 admin).
        </p>

        <H3>Step 2 — Wait for approval</H3>
        <p>
          After registration, your company status is <Badge variant="outline">pending</Badge>. The super admin
          reviews and approves or rejects it. You will not be able to log in until your company is approved.
        </p>

        <H3>Step 3 — Log in and configure settings</H3>
        <p>
          Once approved, log in as the owner. Go to <strong>Packages</strong> → <strong>Company Settings</strong> to
          configure:
        </p>
        <UL items={[
          "Payment QR code (for students to send enrollment payment)",
          "Allow students to pick their teacher (toggle)",
          "Cancellation policy (minimum hours before class, penalty toggle)",
        ]} />

        <H3>Step 4 — Add teachers</H3>
        <p>
          Go to <strong>Teachers</strong> and add teacher accounts. Each teacher gets an email and password they
          use to log in. You can also manage their schedules directly from their profile page.
        </p>

        <H3>Step 5 — Add students and packages</H3>
        <p>
          Go to <strong>Packages</strong> to create tutorial packages (e.g., "8-session English Speaking Package").
          Then go to <strong>Students</strong> to add student accounts.
        </p>

        <Callout type="example">
          A new ESL center registers on Monday. The super admin approves them Tuesday morning. By Tuesday afternoon
          the owner has uploaded their payment QR, created 3 packages, added 2 teachers and 5 students, and the
          first bookings are already coming in.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "students",
    icon: <Users className="h-5 w-5" />,
    title: "Student Management",
    content: (
      <SectionBlock>
        <H3>Adding a student</H3>
        <p>
          Go to <strong>Students</strong> → <strong>Add Student</strong>. Fill in their name, email, password,
          age, nationality, and optional guardian name. The student can then log in and start enrolling in packages.
        </p>

        <H3>Enrolling a student in a package</H3>
        <p>
          Students can enroll themselves via the student dashboard. They select a package, upload a payment receipt,
          and submit. The admin then reviews the receipt and confirms or rejects the enrollment from their dashboard's
          pending enrollees section.
        </p>
        <Callout type="important">
          Students cannot book any timeslots until their package enrollment has been confirmed by an admin.
        </Callout>

        <H3>Viewing a student's profile</H3>
        <p>
          Click a student's name in the Students list to open their profile page. From here you can:
        </p>
        <UL items={[
          "View their active packages and remaining sessions",
          "Manually add or adjust a class (admin add class feature)",
          "View all past class reports",
          "Reset their password",
          "Adjust sessions (add or deduct with a reason)",
        ]} />

        <H3>Student search and filtering</H3>
        <p>
          The Students list supports search by name/email and filtering by remaining sessions. Results are
          paginated (10 per page).
        </p>

        <Callout type="example">
          A student calls to say they couldn't attend but forgot to cancel. The admin opens the student's
          profile, finds the booking, and manually marks it to preserve or adjust their session count, then
          adds a note in the report.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "teachers",
    icon: <GraduationCap className="h-5 w-5" />,
    title: "Teacher Management",
    content: (
      <SectionBlock>
        <H3>Adding a teacher</H3>
        <p>
          Go to <strong>Teachers</strong> → <strong>Add Teacher</strong>. Set their name, email, and password.
          Optionally assign a schedule directly during creation.
        </p>

        <H3>Teacher schedule</H3>
        <p>
          Each teacher has a recurring weekly schedule (e.g., Mon/Wed/Fri 9am–5pm at 30-min intervals). Admins
          set this from the teacher's profile page. Students can only book slots within these scheduled times.
        </p>

        <H3>Teacher availability (self-managed)</H3>
        <p>
          Teachers can block specific slots from their own dashboard under <strong>My Availability</strong>. This
          is useful for one-off unavailability without requesting a full leave day. Admins can also manage
          availability from the teacher's profile.
        </p>
        <Callout type="tip">
          Availability blocking respects the company's cancellation policy. A teacher cannot unblock a slot within
          the minimum cancellation window if a student has already booked it.
        </Callout>

        <H3>Leave requests</H3>
        <p>
          Teachers can submit leave requests from their dashboard. Admins approve or reject these from the
          teacher's profile page. Approved leaves block all their slots on those days automatically.
        </p>

        <H3>Absence tracking</H3>
        <p>
          When marking a class as done, admins can flag whether the student or teacher was absent. This is
          recorded on the booking and visible in reports and the student's profile.
        </p>

        <Callout type="example">
          Teacher Kim is sick on Friday. She submits a leave request. The admin approves it. All of Friday's
          student bookings for Kim are automatically cancelled and the students are notified in real time.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "scheduling",
    icon: <CalendarDays className="h-5 w-5" />,
    title: "Booking & Scheduling",
    content: (
      <SectionBlock>
        <H3>How students book classes</H3>
        <p>
          From the student dashboard, students click any available date on the calendar. They are taken to the
          timeslot page where they see open slots. They select a slot (and optionally a teacher if the company
          allows teacher-picking), then confirm the booking.
        </p>

        <H3>Admin-created bookings</H3>
        <p>
          Admins can manually book a class for a student from the student's profile page via <strong>Add Class</strong>.
          This is useful for make-up classes or situations where the student cannot self-book.
        </p>

        <H3>Online vs in-person classes</H3>
        <p>
          When creating or confirming a booking, admins can set the <strong>class mode</strong>:
        </p>
        <UL items={[
          "In-person — student comes to the center",
          "Online — a meeting link (e.g., Zoom/Google Meet) is attached to the booking",
        ]} />

        <H3>Overlap prevention</H3>
        <p>
          The system automatically prevents double-bookings. A student cannot have two classes within 30 minutes
          of each other, and a teacher cannot be assigned to two students at the same time.
        </p>

        <H3>Cancellations</H3>
        <p>
          Students can cancel upcoming bookings from their dashboard. The company's cancellation policy determines
          the minimum hours before class a cancellation is allowed. If cancellations happen within the penalty
          window, a session deduction may apply depending on company settings.
        </p>

        <H3>Marking a class as done</H3>
        <p>
          Admins confirm completed classes from the Admin Dashboard's weekly calendar view or from the student
          profile. After marking done, the teacher is prompted to submit a class report.
        </p>

        <Callout type="important">
          When a student's remaining sessions drop to 2 or below, both the student and all admins receive an
          automatic low-session notification. At 0 sessions, a package exhausted notification is sent.
        </Callout>

        <Callout type="example">
          A student has 1 session left and books their final class. After the class is marked done, the admin
          gets a notification saying "Student [Name]'s package has been exhausted." The admin then reaches out
          to the student to re-enroll.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "packages",
    icon: <Package className="h-5 w-5" />,
    title: "Packages & Enrollment",
    content: (
      <SectionBlock>
        <H3>Creating a tutorial package</H3>
        <p>
          Go to <strong>Packages</strong> → <strong>Add Package</strong>. Set the package name, subject
          (e.g., Speaking, Grammar), number of sessions, duration per session (in minutes), price, and an
          optional description. Packages can be toggled active/inactive.
        </p>

        <H3>Student enrollment flow</H3>
        <UL items={[
          "Student selects a package from their dashboard",
          "Student uploads a payment receipt (photo of bank transfer or QR payment proof)",
          "Admin reviews the receipt in the Pending Enrollees section of the Admin Dashboard",
          "Admin confirms or rejects the enrollment",
          "Upon confirmation, sessions are credited to the student's account",
        ]} />

        <H3>Session tracking</H3>
        <p>
          Each confirmed booking deducts one session from the student's active package. Admins can manually
          adjust session counts (add or deduct) from the student's profile, with a required reason recorded in
          the session adjustments log.
        </p>

        <Callout type="tip">
          A student can have multiple active packages simultaneously (e.g., one for Speaking and one for
          Grammar). Sessions are tracked per package.
        </Callout>

        <Callout type="example">
          A student paid for 8 sessions. After their 6th class, the admin accidentally marks it done twice.
          The admin opens the student's profile, uses "Adjust Sessions" to add 1 session back with the remark
          "Correction — duplicate done marking on March 15."
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "reports",
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Class Reports & Feedback",
    content: (
      <SectionBlock>
        <H3>Submitting a class report (teachers)</H3>
        <p>
          After a class is marked done, teachers submit a report from the <strong>Completed Classes</strong>
          section of their dashboard. The report includes notes on what was covered, the student's performance,
          and any observations.
        </p>

        <H3>Viewing reports (admins)</H3>
        <p>
          Reports are visible from the student's profile page under the reports section. Admins can see all
          reports for a given student, sorted by date.
        </p>

        <H3>Student feedback</H3>
        <p>
          Students can submit general feedback about their experience from their profile page. This feedback is
          visible to admins and is linked to the teacher if specified.
        </p>

        <Callout type="example">
          A parent inquires about their child's progress. The admin opens the student's profile, pulls up the
          last 3 class reports, and shares the teacher's notes with the parent — providing clear, documented
          evidence of the student's learning journey.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "notifications",
    icon: <Bell className="h-5 w-5" />,
    title: "Notifications",
    content: (
      <SectionBlock>
        <p>
          Brightfolks uses <strong>real-time notifications</strong> via socket.io. The bell icon in the top
          navbar shows unread notification count.
        </p>

        <H3>Automatic notification triggers</H3>
        <UL items={[
          "New package enrollment request submitted by a student",
          "Enrollment confirmed or rejected by admin",
          "Booking cancelled (by student or admin)",
          "Leave request approved or rejected",
          "Teacher slot blocked/unblocked",
          "Student's sessions drop to 2 or fewer (low-session warning)",
          "Student's package sessions reach 0 (package exhausted)",
          "Company upgrade request approved or rejected (super admin → company)",
        ]} />

        <H3>Reading notifications</H3>
        <p>
          Click the bell icon to open the notification panel. Individual notifications can be marked as read,
          or all can be dismissed at once with <strong>Mark All Read</strong>.
        </p>

        <Callout type="tip">
          Notifications are role-specific — students only see their own booking/package events, teachers see
          their leave/booking events, and admins see all company-wide events.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "analytics",
    icon: <BarChart2 className="h-5 w-5" />,
    title: "Analytics",
    content: (
      <SectionBlock>
        <H3>Admin analytics</H3>
        <p>
          Available from the Admin Dashboard (scroll down past the schedule). Shows:
        </p>
        <UL items={[
          "Sessions per month (bar chart) — see which months are busiest",
          "Student growth over time (line chart) — track enrollment growth",
          "Totals: active students, active teachers, completed sessions this month",
        ]} />

        <H3>Super Admin analytics</H3>
        <p>
          Available from the Super Admin Dashboard. Shows platform-wide metrics:
        </p>
        <UL items={[
          "Company growth over time (line chart)",
          "Total sessions across all companies",
          "Companies by subscription plan (pie chart)",
        ]} />

        <Callout type="example">
          An owner notices from the analytics that session volume drops every July and August. They decide to
          run a summer promotion to counter the seasonal dip — a data-driven decision made possible through the
          built-in analytics.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "audit",
    icon: <ClipboardList className="h-5 w-5" />,
    title: "Audit Log",
    content: (
      <SectionBlock>
        <p>
          The <strong>Activity Log</strong> (accessible from the profile dropdown → Activity Log) records every
          significant action taken within the system.
        </p>

        <H3>What is logged</H3>
        <UL items={[
          "Student added, edited, or deleted",
          "Teacher added, edited, or deleted",
          "Booking created, confirmed, cancelled, or marked done",
          "Package enrollment confirmed or rejected",
          "Leave request approved or rejected",
          "Sub-admin created or permissions changed",
          "Company settings updated",
          "Session adjustments (add/deduct)",
        ]} />

        <H3>Filtering and searching</H3>
        <p>
          Logs can be filtered by date range and action type. Super admins see logs from all companies;
          company admins only see their own company's logs.
        </p>

        <Callout type="example">
          A student disputes that their sessions were incorrectly deducted. The admin opens the Activity Log,
          filters by the student's name, and can see exactly who marked the class done and when — providing a
          clear audit trail for resolving the dispute.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "subscription",
    icon: <Star className="h-5 w-5" />,
    title: "Subscription & Billing",
    content: (
      <SectionBlock>
        <H3>Subscription plans</H3>
        <p>Plans determine the maximum number of students, teachers, and admins a company can have:</p>
        <UL items={[
          "Free Trial — ₱0/month, 30 days, up to 2 students, 1 teacher, 1 admin",
          "Basic — ₱999/month",
          "Standard — ₱2,499/month",
          "Premium — ₱4,999/month",
        ]} />

        <H3>Trial expiry</H3>
        <p>
          When a Free Trial expires, the company owner is redirected to the <strong>Upgrade</strong> page upon
          login. All other users from that company are blocked until an upgrade is completed. The company
          account transitions to <Badge variant="outline">locked</Badge> status.
        </p>

        <H3>Upgrading a plan</H3>
        <p>
          From the Upgrade page, the owner selects a new plan and submits an upgrade request. The super admin
          reviews and approves it. Upon approval, the company account is reactivated with the new plan limits.
        </p>

        <H3>Payment due dates</H3>
        <p>
          Once on a paid plan, the company has a <strong>next due date</strong>. If payment is not processed
          by that date, the super admin can lock the account until payment is confirmed.
        </p>

        <Callout type="important">
          Upgrading from Free Trial to a paid plan is a manual approval flow. The super admin must approve the
          request before the company gains access to the higher plan limits.
        </Callout>

        <Callout type="example">
          A company on the Free Trial grows to 5 students. They hit the 2-student limit and cannot add more.
          The owner submits an upgrade request to the Basic plan. The super admin approves it the next morning.
          The owner can now add up to the Basic plan's student limit immediately.
        </Callout>
      </SectionBlock>
    ),
  },
  {
    id: "admins",
    icon: <UserCog className="h-5 w-5" />,
    title: "Sub-Admin Management",
    content: (
      <SectionBlock>
        <p>
          Company owners can create sub-admin accounts to delegate work to staff without giving them full
          owner access. This is managed from <strong>Admins</strong> in the navbar.
        </p>

        <H3>Creating a sub-admin</H3>
        <p>
          Only the owner can create sub-admin accounts. Set their name, email, password, and choose which
          teacher management permissions to grant:
        </p>
        <UL items={[
          "Can add teachers",
          "Can edit teachers",
          "Can delete teachers",
        ]} />

        <H3>What sub-admins can always do</H3>
        <UL items={[
          "View and manage students",
          "Confirm/reject enrollments",
          "Manage bookings and the weekly schedule",
          "View class reports",
        ]} />

        <H3>What sub-admins cannot do</H3>
        <UL items={[
          "Create other sub-admins",
          "Change company settings",
          "View or submit upgrade requests",
          "Access the Activity Log",
          "Access this documentation",
        ]} />

        <Callout type="tip">
          If a sub-admin leaves your organization, deactivate their account from the Admins page immediately
          to prevent unauthorized access.
        </Callout>
      </SectionBlock>
    ),
  },
];

const DocumentationPage = () => {
  const authContext = useContext(AuthContext);
  const role = authContext?.user?.role;
  const isOwner = authContext?.user?.is_owner ?? false;
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ overview: true });

  // Guard: only owner or super_admin
  if (role !== "super_admin" && !(role === "company_admin" && isOwner)) {
    return <Navigate to="/" replace />;
  }

  const toggle = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    sections.forEach((s) => (all[s.id] = true));
    setOpenSections(all);
  };

  const collapseAll = () => setOpenSections({});

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-[#65C3E8]" />
              Platform Documentation
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Complete guide to features, workflows, and practical usage of Brightfolks.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={expandAll}
              className="text-xs text-[#65C3E8] hover:underline"
            >
              Expand all
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={collapseAll}
              className="text-xs text-gray-400 hover:underline"
            >
              Collapse all
            </button>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-3">
          {sections.map((section) => {
            const isOpen = openSections[section.id] ?? false;
            return (
              <Card key={section.id} className="overflow-hidden">
                <CardHeader
                  className="py-4 px-5 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggle(section.id)}
                >
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[#65C3E8]">{section.icon}</span>
                      <span>{section.title}</span>
                      {section.badge && (
                        <Badge className="bg-[#65C3E8]/10 text-[#65C3E8] text-xs font-normal border border-[#65C3E8]/30">
                          {section.badge}
                        </Badge>
                      )}
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                  </CardTitle>
                </CardHeader>
                {isOpen && (
                  <CardContent className="px-5 pb-5 border-t pt-4">
                    {section.content}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DocumentationPage;
