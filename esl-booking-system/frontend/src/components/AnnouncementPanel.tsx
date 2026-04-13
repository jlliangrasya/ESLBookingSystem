import { useState, useEffect, useContext, useCallback } from "react";
import axios from "axios";
import { Megaphone, Pin, X, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AuthContext from "@/context/AuthContext";

interface Announcement {
  id: number;
  title: string;
  content: string;
  audience: string;
  is_pinned: boolean;
  is_read: boolean;
  author_name: string;
  created_at: string;
  expires_at: string | null;
}

const AnnouncementPanel: React.FC = () => {
  const authContext = useContext(AuthContext);
  const token = authContext?.token ?? null;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchAnnouncements = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(
        `${import.meta.env.VITE_API_URL}/api/announcements`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const rows = Array.isArray(res.data?.data) ? res.data.data : [];
      setAnnouncements(rows);
    } catch {
      // silently fail
    }
  }, [token]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const markAsRead = async (id: number) => {
    if (!token) return;
    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/announcements/${id}/read`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAnnouncements(prev => prev.map(a => a.id === id ? { ...a, is_read: true } : a));
    } catch {
      // silently fail
    }
  };

  const unreadCount = announcements.filter(a => !a.is_read).length;

  if (announcements.length === 0) return null;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const audienceLabel = (audience: string) => {
    switch (audience) {
      case "teachers": return "Teachers";
      case "students": return "Students";
      case "all": return "Everyone";
      case "company_admin": return "All Admins";
      default: return audience;
    }
  };

  return (
    <div className="mb-4">
      <div
        className="flex items-center justify-between cursor-pointer bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-t-lg px-4 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-medium text-sm">
          <Megaphone className="h-4 w-4" />
          Announcements
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0">
              {unreadCount} new
            </Badge>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-blue-500" /> : <ChevronDown className="h-4 w-4 text-blue-500" />}
      </div>

      {expanded && (
        <div className="border border-t-0 border-blue-200 dark:border-blue-800 rounded-b-lg divide-y divide-blue-100 dark:divide-blue-900 max-h-80 overflow-y-auto">
          {announcements.map(a => (
            <div
              key={a.id}
              className={`px-4 py-3 ${!a.is_read ? "bg-blue-50/50 dark:bg-blue-950/50" : "bg-white dark:bg-gray-950"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {a.is_pinned && <Pin className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                    <span className={`text-sm font-semibold ${!a.is_read ? "text-blue-800 dark:text-blue-200" : "text-gray-700 dark:text-gray-300"}`}>
                      {a.title}
                    </span>
                    {!a.is_read && (
                      <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.author_name} &middot; {formatDate(a.created_at)} &middot; <span className="capitalize">{audienceLabel(a.audience)}</span>
                  </div>

                  {expandedId === a.id ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">{a.content}</p>
                  ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">{a.content}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === a.id ? null : a.id); }}
                  >
                    {expandedId === a.id ? "Less" : "More"}
                  </Button>
                  {!a.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                      onClick={(e) => { e.stopPropagation(); markAsRead(a.id); }}
                      title="Mark as read"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnouncementPanel;
