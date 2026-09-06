import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Bell,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Inbox,
  Globe2,
  Heart,
  Laptop,
  LayoutDashboard,
  Link2,
  LogIn,
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Pencil,
  PhoneOff,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  UserRound,
  UsersRound,
  Video,
  VideoOff,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useWebRtcRoom } from "@/lib/webrtc";

type View = "discover" | "connections" | "inbox" | "profile" | "room" | "dashboard";
type Profile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  timezone: string | null;
  interests: string[];
  skills: string[];
};
type AuthMode = "login" | "signup";
type ConnectionRecord = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted" | "declined";
};
type Message = {
  id: string;
  connection_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};
type CallRecord = {
  id: string;
  connection_id: string;
  caller_id: string;
  callee_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  status: string;
};

function formatDuration(seconds: number | null) {
  if (!seconds) return "less than a minute";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest}s`;
  return `${minutes}m ${rest}s`;
}

function Avatar({ profile, className = "", textClass = "text-2xl", tone = "bg-sky" }: { profile: { display_name: string; avatar_url: string | null }; className?: string; textClass?: string; tone?: string }) {
  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt={`${profile.display_name}'s photo`} className={`avatar-ink rounded-full object-cover ${className}`} />;
  }
  return <div className={`avatar-ink ${tone} flex items-center justify-center rounded-full font-display ${textClass} ${className}`}>{(profile.display_name[0] ?? "?").toUpperCase()}</div>;
}


const demoProfiles: Profile[] = [
  { id: "demo-1", handle: "maya.makes", display_name: "Maya Chen", avatar_url: null, bio: "Building kinder tools for curious people.", location: "Singapore", timezone: "GMT+8", interests: ["design", "community", "music"], skills: ["UX", "research"] },
  { id: "demo-2", handle: "joao.codes", display_name: "João Ribeiro", avatar_url: null, bio: "Code, coffee, and small internet experiments.", location: "Lisbon", timezone: "GMT+0", interests: ["open source", "coffee", "maps"], skills: ["React", "systems"] },
  { id: "demo-3", handle: "amina.frames", display_name: "Amina Okafor", avatar_url: null, bio: "Visual storyteller collecting everyday magic.", location: "Lagos", timezone: "GMT+1", interests: ["film", "travel", "storytelling"], skills: ["photo", "video"] },
  { id: "demo-4", handle: "leo.grows", display_name: "Leo Martinez", avatar_url: null, bio: "Making cities greener, one rooftop at a time.", location: "Mexico City", timezone: "GMT-6", interests: ["climate", "food", "startups"], skills: ["strategy", "community"] },
  { id: "demo-5", handle: "sora.notes", display_name: "Sora Kim", avatar_url: null, bio: "Tiny notes about people, place, and possibility.", location: "Seoul", timezone: "GMT+9", interests: ["writing", "culture", "language"], skills: ["editorial", "brand"] },
  { id: "demo-6", handle: "noah.builds", display_name: "Noah Williams", avatar_url: null, bio: "Hardware tinkerer and friendly neighborhood nerd.", location: "Austin", timezone: "GMT-5", interests: ["hardware", "robotics", "games"], skills: ["prototyping", "engineering"] },
];
const defaultDemoProfile: Profile = {
  id: "demo-1",
  handle: "maya.makes",
  display_name: "Maya Chen",
  avatar_url: null,
  bio: "Building kinder tools for curious people.",
  location: "Singapore",
  timezone: "GMT+8",
  interests: ["design", "community", "music"],
  skills: ["UX", "research"],
};

const tones = ["tone-coral", "tone-sky", "tone-lilac", "tone-mint"];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Global Link — Find your people" },
      { name: "description", content: "Discover thoughtful people around the world, build your profile, and meet face-to-face in video rooms." },
      { property: "og:title", content: "Global Link — Find your people" },
      { property: "og:description", content: "Discover thoughtful people around the world, build your profile, and meet face-to-face in video rooms." },
    ],
  }),
  component: Index,
});

function Index() {
  const [view, setView] = useState<View>("discover");
  const [opening, setOpening] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>(demoProfiles);
  const [session, setSession] = useState<Session | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All people");
  const [following, setFollowing] = useState<string[]>(["demo-2"]);
  const [connections, setConnections] = useState<string[]>(["demo-3"]);
  const [connectionRecords, setConnectionRecords] = useState<ConnectionRecord[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [roomProfile, setRoomProfile] = useState<Profile | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const activeCallId = useRef<string | null>(null);
  const [notice, setNotice] = useState("");


  useEffect(() => {
    const openingTimer = window.setTimeout(() => setOpening(false), 1450);
    let active = true;
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) {
        setSession(data.session);
        await loadMemberData(data.session.user.id);
      }
    };
    void loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) void loadMemberData(nextSession.user.id);
    });
    return () => {
      active = false;
      window.clearTimeout(openingTimer);
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel(`member-messages:${session.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${session.user.id}` }, (payload) => {
        setMessages((current) => current.some((message) => message.id === String(payload.new["id"])) ? current : [...current, payload.new as Message]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [session]);

  const loadMemberData = async (userId: string) => {
    const [profileResult, profilesResult, followsResult, connectionsResult, messagesResult, callsResult] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("profiles").select("*").neq("id", userId).order("display_name"),
      supabase.from("follows").select("following_id").eq("follower_id", userId),
      supabase.from("connections").select("id, requester_id, addressee_id, status").or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
      supabase.from("messages").select("*").or(`sender_id.eq.${userId},recipient_id.eq.${userId}`).order("created_at"),
      supabase.from("call_sessions").select("*").or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order("started_at", { ascending: false }).limit(30),
    ]);
    if (callsResult.data) setCalls(callsResult.data as CallRecord[]);

    if (profileResult.data) setMyProfile(profileResult.data as Profile);
    else {
      const fallbackProfile: Profile = { id: userId, handle: `member-${userId.slice(0, 6)}`, display_name: "New member", avatar_url: null, bio: "A little space for the things I care about.", location: "Somewhere on Earth", timezone: "Your time", interests: ["curious", "kind", "global"], skills: ["your thing"] };
      const { data } = await supabase.from("profiles").insert(fallbackProfile).select().single();
      if (data) setMyProfile(data as Profile);
    }
    if (profilesResult.data) setProfiles(profilesResult.data as Profile[]);
    setFollowing(followsResult.data ? followsResult.data.map((row) => row.following_id) : []);
    if (connectionsResult.data) {
      setConnectionRecords(connectionsResult.data as ConnectionRecord[]);
      setConnections(connectionsResult.data.filter((row) => row.status === "accepted").map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id));
    } else {
      setConnectionRecords([]);
      setConnections([]);
    }
    setMessages(messagesResult.data ? (messagesResult.data as Message[]) : []);
  };

  const logCallStart = useCallback(async (connectionId: string, remoteId: string) => {
    if (!session) return;
    const { data } = await supabase
      .from("call_sessions")
      .insert({ connection_id: connectionId, caller_id: session.user.id, callee_id: remoteId, status: "started" })
      .select()
      .single();
    if (data) {
      activeCallId.current = data.id;
      setCalls((current) => [data as CallRecord, ...current]);
    }
  }, [session]);

  const logCallEnd = useCallback(async (seconds: number) => {
    const id = activeCallId.current;
    if (!id || !session) return;
    activeCallId.current = null;
    const endedAt = new Date().toISOString();
    await supabase.from("call_sessions").update({ ended_at: endedAt, duration_seconds: seconds, status: "ended" }).eq("id", id);
    setCalls((current) => current.map((call) => (call.id === id ? { ...call, ended_at: endedAt, duration_seconds: seconds, status: "ended" } : call)));
  }, [session]);

  const uploadAvatar = async (file: File) => {
    if (!session) {
      setNotice("Sign in to upload a photo.");
      return null;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${session.user.id}/avatar-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setNotice("That photo could not be uploaded. Try a smaller image.");
      return null;
    }
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 3650);
    if (!data?.signedUrl) {
      setNotice("Photo uploaded, but we could not show it yet.");
      return null;
    }
    return data.signedUrl;
  };

  const acceptConnection = async (connectionId: string) => {
    if (!session) return;
    const { error } = await supabase.from("connections").update({ status: "accepted" }).eq("id", connectionId);
    if (error) setNotice("That request could not be accepted yet.");
    else {
      setNotice("You're connected. Say hello.");
      await loadMemberData(session.user.id);
    }
  };





  const visibleProfiles = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return profiles.filter((profile) => {
      const matchesSearch = !normalized || [profile.display_name, profile.handle, profile.location, ...profile.interests, ...profile.skills].filter(Boolean).join(" ").toLowerCase().includes(normalized);
      const matchesFilter = activeFilter === "All people" || (activeFilter === "Near me" ? profile.location === "Singapore" : activeFilter === "Design + creative" ? profile.skills.some((skill) => ["UX", "photo", "video", "editorial", "brand"].includes(skill)) : activeFilter === "Builders" ? profile.skills.some((skill) => ["React", "systems", "engineering", "prototyping"].includes(skill)) : true);
      return matchesSearch && matchesFilter;
    });
  }, [profiles, search, activeFilter]);

  const toggleFollow = async (profile: Profile) => {
    if (!session) {
      setFollowing((current) => current.includes(profile.id) ? current.filter((id) => id !== profile.id) : [...current, profile.id]);
      setNotice("Demo action saved — sign in to keep it across devices.");
      return;
    }
    const isFollowing = following.includes(profile.id);
    if (isFollowing) {
      const { error } = await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("following_id", profile.id);
      if (error) { setNotice("Could not unfollow just now. Try again."); return; }
      setFollowing((current) => current.filter((id) => id !== profile.id));
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: session.user.id, following_id: profile.id });
      if (error) { setNotice("Could not follow just now. Try again."); return; }
      setFollowing((current) => [...current, profile.id]);
    }
  };

  const connect = async (profile: Profile) => {
    if (!session) {
      setConnections((current) => current.includes(profile.id) ? current : [...current, profile.id]);
      setNotice("Connection request sent in demo mode — sign in to make it real.");
      return;
    }
    const existing = connectionRecords.find((connection) => connection.requester_id === profile.id || connection.addressee_id === profile.id);
    if (existing) {
      setNotice(existing.status === "accepted" ? `You are already connected with ${profile.display_name}.` : "That connection request is already pending.");
      return;
    }
    const { error } = await supabase.from("connections").insert({ requester_id: session.user.id, addressee_id: profile.id, status: "pending" });
    setNotice(error ? "That connection is already in your list." : `Request sent to ${profile.display_name}.`);
    if (!error) await loadMemberData(session.user.id);
  };

  const openInbox = (profileId?: string) => {
    setSelectedPersonId(profileId ?? selectedPersonId ?? connections[0] ?? null);
    setView("inbox");
  };

  const saveProfile = async (nextProfile: Profile) => {
    setMyProfile(nextProfile);
    if (!session) {
      setNotice("Profile preview saved — sign in to publish it.");
      return;
    }
    const { error } = await supabase.from("profiles").upsert({ ...nextProfile, id: session.user.id });
    setNotice(error ? "Could not save your profile yet." : "Your profile is live.");
    if (!error) await loadMemberData(session.user.id);
  };

  const handleAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");
    if (authMode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      setAuthMessage(error ? error.message : "Welcome back.");
      if (!error) setAuthOpen(false);
    } else {
      const { data, error } = await supabase.auth.signUp({ email: authEmail, password: authPassword, options: { data: { display_name: authName }, emailRedirectTo: window.location.origin } });
      if (error) setAuthMessage(error.message);
      else if (data.session) setAuthMessage("Your account is ready.");
      else setAuthMessage("Check your email to finish creating your account.");
    }
    setAuthBusy(false);
  };

  const signInGoogle = async () => {
    setAuthBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) setAuthMessage(result.error.message);
    setAuthBusy(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMyProfile(null);
    setProfiles(demoProfiles);
    setFollowing(["demo-2"]);
    setConnections(["demo-3"]);
    setConnectionRecords([]);
    setMessages([]);
    setView("discover");
  };

  const displayProfile = myProfile ?? { id: session?.user.id ?? "demo-me", handle: "your.handle", display_name: authName || "Your new profile", avatar_url: null, bio: "A little space for the things I care about.", location: "Somewhere on Earth", timezone: "Your time", interests: ["curious", "kind", "global"], skills: ["your thing", "another thing"] };

  const selectedPerson = profiles.find((profile) => profile.id === selectedPersonId) ?? profiles[0] ?? defaultDemoProfile;
  const selectedConnection = session && selectedPersonId ? connectionRecords.find((connection) => connection.status === "accepted" && (connection.requester_id === selectedPersonId || connection.addressee_id === selectedPersonId)) ?? null : null;

  return (
    <main className="app-surface doodle-cursor min-h-screen p-3 text-ink sm:p-6">
      {opening && <OpeningAnimation onSkip={() => setOpening(false)} />}
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[1500px] flex-col overflow-hidden window-chrome sm:min-h-[calc(100vh-3rem)]">
        <div className="window-titlebar flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-1.5" aria-label="Window controls">
              <span className="h-3 w-3 rounded-full border-2 border-ink bg-signal" />
              <span className="h-3 w-3 rounded-full border-2 border-ink bg-mint" />
              <span className="h-3 w-3 rounded-full border-2 border-ink bg-sky" />
            </div>
            <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.08em]">global_link / home</span>
          </div>
          <div className="hidden items-center gap-2 text-[11px] font-medium uppercase sm:flex"><Globe2 className="size-4" /> online everywhere</div>
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[210px_1fr]">
          <aside className="border-b-2 border-ink bg-butter/55 p-4 lg:border-b-0 lg:border-r-2">
            <div className="mb-7 flex items-center gap-2 px-1">
              <div className="flex size-9 rotate-[-6deg] items-center justify-center border-2 border-ink bg-signal text-panel shadow-[3px_3px_0_var(--color-ink)]"><Link2 className="size-5" /></div>
              <div><div className="hand-title text-2xl">global</div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">link</div></div>
            </div>
            <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Main navigation">
              <NavButton active={view === "dashboard"} icon={<LayoutDashboard />} label="Dashboard" onClick={() => setView("dashboard")} />
              <NavButton active={view === "discover"} icon={<Sparkles />} label="Discover" onClick={() => setView("discover")} />
              <NavButton active={view === "connections"} icon={<UsersRound />} label="My people" onClick={() => setView("connections")} />
              <NavButton active={view === "inbox"} icon={<Inbox />} label="Inbox" onClick={() => openInbox()} />
              <NavButton active={view === "profile"} icon={<UserRound />} label="My profile" onClick={() => setView("profile")} />
              <NavButton active={view === "room"} icon={<Video />} label="Video room" onClick={() => setView("room")} />
            </nav>
            <div className="mt-7 hidden border-t-2 border-ink pt-5 lg:block">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em]">little shortcuts</div>
              <button className="mb-2 flex w-full items-center gap-2 text-left text-xs font-medium hover:underline" onClick={() => { setView("discover"); setActiveFilter("Design + creative"); }}><span className="text-signal">✦</span> creative folks</button>
              <button className="flex w-full items-center gap-2 text-left text-xs font-medium hover:underline" onClick={() => { setView("discover"); setActiveFilter("Builders"); }}><span className="text-signal">✦</span> people who build</button>
            </div>
            <div className="mt-8 hidden rotate-[-2deg] border-2 border-ink bg-panel p-3 text-center shadow-[3px_3px_0_var(--color-ink)] lg:block">
              <CircleHelp className="mx-auto mb-1 size-5" /><div className="hand-title text-xl">be a good internet person</div><p className="mt-1 text-[10px] leading-4">Say hello with context. Leave room for a no.</p>
            </div>
          </aside>

          <section className="min-w-0 bg-paper/70">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-4 py-3 sm:px-6">
              <div className="relative min-w-[220px] flex-1 sm:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="search people, skills, places..." className="h-10 w-full border-2 border-ink bg-panel pl-9 pr-3 text-xs outline-none placeholder:text-ink/55 focus:shadow-[3px_3px_0_var(--color-ink)]" /></div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" title="Notifications" aria-label="Notifications"><Bell className="size-5" /></Button>
                {session ? <Button variant="outline" size="sm" onClick={() => void signOut()}><LogOut /> sign out</Button> : <Button variant="default" size="sm" onClick={() => { setAuthOpen(true); setAuthMode("login"); }}><LogIn /> sign in</Button>}
                <Avatar profile={displayProfile} className="size-9" textClass="text-lg" />
              </div>
            </header>

            {notice && <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-mint px-4 py-2 text-xs font-medium sm:px-6"><span>{notice}</span><button aria-label="Dismiss notice" onClick={() => setNotice("")}><X className="size-4" /></button></div>}

            <div className="min-h-0 p-4 sm:p-6">
               {view === "discover" && <DiscoverView profiles={visibleProfiles} following={following} connections={connections} activeFilter={activeFilter} setActiveFilter={setActiveFilter} onFollow={toggleFollow} onConnect={connect} onRoom={(profile) => { setRoomProfile(profile); setView("room"); }} />}
               {view === "connections" && <ConnectionsView profiles={profiles} following={following} connections={connections} onFollow={toggleFollow} onRoom={(profile) => { setRoomProfile(profile); setView("room"); }} onMessage={openInbox} />}
               {view === "inbox" && <InboxView session={session} profiles={profiles} connections={connections} messages={messages} selectedPerson={selectedPerson} selectedConnection={selectedConnection} onSelect={setSelectedPersonId} onSend={async (body) => { if (!session || !selectedConnection) return; const { data, error } = await supabase.from("messages").insert({ connection_id: selectedConnection.id, sender_id: session.user.id, recipient_id: selectedPerson.id, body }).select().single(); if (error) setNotice("That message could not be sent yet."); else if (data) setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as Message]); }} onSignIn={() => { setAuthOpen(true); setAuthMode("login"); }} />}
              {view === "profile" && <ProfileView profile={displayProfile} session={session} onEdit={() => setProfileEditorOpen(true)} />}
               {view === "room" && <VideoRoom profile={roomProfile ?? profiles[0] ?? defaultDemoProfile} session={session} connection={roomProfile ? connectionRecords.find((item) => item.status === "accepted" && (item.requester_id === roomProfile.id || item.addressee_id === roomProfile.id)) ?? null : null} onCallStart={logCallStart} onCallEnd={logCallEnd} onMessage={() => openInbox(roomProfile?.id)} onClose={() => setView("discover")} />}
               {view === "dashboard" && <DashboardView profile={displayProfile} session={session} profiles={profiles} connections={connections} connectionRecords={connectionRecords} following={following} messages={messages} calls={calls} onEdit={() => setProfileEditorOpen(true)} onInbox={openInbox} onRoom={(profile) => { setRoomProfile(profile); setView("room"); }} onSignIn={() => { setAuthOpen(true); setAuthMode("login"); }} onAccept={acceptConnection} />}
            </div>
          </section>
        </div>
      </div>

      {authOpen && <AuthModal mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} name={authName} setName={setAuthName} message={authMessage} busy={authBusy} onSubmit={handleAuth} onGoogle={signInGoogle} onClose={() => setAuthOpen(false)} />}
      {profileEditorOpen && <ProfileEditor onUploadAvatar={uploadAvatar} profile={displayProfile} onSave={(profile) => { void saveProfile(profile); setProfileEditorOpen(false); }} onClose={() => setProfileEditorOpen(false)} />}
    </main>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <Button variant="ghost" className={`justify-start border-2 px-3 py-2.5 text-left text-xs ${active ? "border-ink bg-panel shadow-[2px_2px_0_var(--color-ink)]" : "border-transparent"}`} onClick={onClick}>{icon}<span>{label}</span>{active && <ChevronRight className="ml-auto size-3" />}</Button>;
}

function DiscoverView({ profiles, following, connections, activeFilter, setActiveFilter, onFollow, onConnect, onRoom }: { profiles: Profile[]; following: string[]; connections: string[]; activeFilter: string; setActiveFilter: (filter: string) => void; onFollow: (profile: Profile) => void; onConnect: (profile: Profile) => void; onRoom: (profile: Profile) => void }) {
  const filters = ["All people", "Near me", "Design + creative", "Builders"];
  return <div>
    <div className="mb-6 grid gap-5 xl:grid-cols-[1fr_285px]">
      <div className="relative overflow-hidden border-b-2 border-ink pb-6 pt-2">
        <div className="mb-3 inline-flex items-center gap-2 stamp bg-sky px-3 py-1 text-[10px] font-medium uppercase"><Globe2 className="size-3" /> 6,420 people online</div>
        <h1 className="hand-title max-w-2xl text-6xl sm:text-8xl">find your<br /><span className="scribble-underline text-signal">people.</span></h1>
        <p className="mt-5 max-w-xl text-sm leading-6">A corner of the internet for meaningful hellos, unexpected collaborations, and friends who live on the other side of the map.</p>
        <div className="mt-5 flex flex-wrap gap-2">{filters.map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={`sketch-border-light px-3 py-2 text-[10px] font-medium uppercase transition ${activeFilter === filter ? "bg-butter" : "bg-panel hover:bg-sky"}`}>{filter}</button>)}</div>
      </div>
      <div className="ruled-paper sketch-border self-start bg-panel p-4">
        <div className="mb-4 flex items-center justify-between"><span className="font-mono text-[10px] uppercase">today's nudge</span><Sparkles className="size-4 text-signal" /></div>
        <div className="hand-title text-3xl">Ask someone what they're learning.</div>
        <p className="mt-3 text-xs leading-5">Better than “hey”. Curiosity travels well.</p>
        <div className="mt-5 flex items-center gap-2 border-t-2 border-ink pt-3 text-[10px] font-medium"><span className="size-2 rounded-full bg-signal" /> 12 people are open to a chat</div>
      </div>
    </div>
    <div className="mb-3 flex items-end justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">the world, a little smaller</div><h2 className="hand-title mt-1 text-4xl">people you may click with</h2></div><span className="text-xs">{profiles.length} found</span></div>
    {profiles.length === 0 ? <EmptyState /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{profiles.map((profile, index) => <ProfileCard key={profile.id} profile={profile} tone={tones[index % tones.length] ?? "tone-coral"} isFollowing={following.includes(profile.id)} isConnected={connections.includes(profile.id)} onFollow={() => onFollow(profile)} onConnect={() => onConnect(profile)} onRoom={() => onRoom(profile)} />)}</div>}
  </div>;
}

function ProfileCard({ profile, tone, isFollowing, isConnected, onFollow, onConnect, onRoom }: { profile: Profile; tone: string; isFollowing: boolean; isConnected: boolean; onFollow: () => void; onConnect: () => void; onRoom: () => void }) {
  return <article className="noisy-hover sketch-border bg-panel p-4">
    <div className="flex items-start justify-between gap-3"><Avatar profile={profile} tone={tone} className="size-14 shrink-0" textClass="text-3xl" /><button className="p-1 hover:text-signal" title="More profile options" aria-label={`More options for ${profile.display_name}`}><Settings2 className="size-4" /></button></div>
    <div className="mt-3"><h3 className="hand-title text-3xl">{profile.display_name}</h3><div className="mt-0.5 text-[10px] font-medium">@{profile.handle} <span className="mx-1 text-signal">✦</span> {profile.location}</div><p className="mt-3 min-h-10 text-xs leading-5">{profile.bio}</p></div>
    <div className="mt-3 flex flex-wrap gap-1.5">{profile.interests.slice(0, 3).map((interest) => <span key={interest} className="border border-ink bg-butter px-2 py-1 text-[9px] font-medium uppercase">{interest}</span>)}</div>
    <div className="mt-4 flex flex-wrap gap-2 border-t-2 border-ink pt-3"><Button variant={isConnected ? "secondary" : "default"} size="sm" onClick={onConnect}>{isConnected ? <Check /> : <Plus />} {isConnected ? "connected" : "connect"}</Button><Button variant={isFollowing ? "secondary" : "outline"} size="sm" onClick={onFollow}><Heart className={isFollowing ? "fill-signal text-signal" : ""} /> {isFollowing ? "following" : "follow"}</Button><Button variant="ghost" size="icon" title={`Start a room with ${profile.display_name}`} aria-label={`Start a room with ${profile.display_name}`} onClick={onRoom}><Video /></Button></div>
  </article>;
}

function ConnectionsView({ profiles, following, connections, onFollow, onRoom, onMessage }: { profiles: Profile[]; following: string[]; connections: string[]; onFollow: (profile: Profile) => void; onRoom: (profile: Profile) => void; onMessage: (profileId: string) => void }) {
  const people = profiles.filter((profile) => connections.includes(profile.id));
  return <div><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">your little corner</div><h1 className="hand-title mt-1 text-6xl">my people</h1></div><div className="stamp bg-coral px-3 py-2 text-xs font-medium">{connections.length} connections / {following.length} following</div></div><div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]"><div className="sketch-border bg-panel p-4"><div className="mb-4 flex items-center justify-between border-b-2 border-ink pb-3"><span className="font-mono text-[10px] uppercase">connections</span><MessageCircle className="size-4" /></div>{people.length ? people.map((profile, index) => <div className="flex items-center gap-3 border-b border-ink/35 py-3 last:border-0" key={profile.id}><Avatar profile={profile} tone={tones[index % tones.length] ?? "tone-coral"} className="size-11" textClass="text-2xl" /><div className="min-w-0 flex-1"><div className="hand-title text-2xl">{profile.display_name}</div><div className="truncate text-[10px]">{profile.location} · {profile.interests.slice(0, 2).join(" / ")}</div></div><Button variant="ghost" size="icon" title={`Message ${profile.display_name}`} aria-label={`Message ${profile.display_name}`} onClick={() => onMessage(profile.id)}><MessageCircle /></Button><Button variant="outline" size="icon" title={`Video call ${profile.display_name}`} aria-label={`Video call ${profile.display_name}`} onClick={() => onRoom(profile)}><Video /></Button></div>) : <EmptyState compact />}</div><div className="sketch-border bg-lilac p-5"><div className="font-mono text-[10px] uppercase">people you follow</div><div className="mt-4 space-y-3">{profiles.filter((profile) => following.includes(profile.id)).slice(0, 5).map((profile) => <div className="flex items-center gap-2" key={profile.id}><Avatar profile={profile} tone="bg-panel" className="size-9" textClass="text-lg" /><span className="flex-1 text-xs font-medium">{profile.display_name}</span><button className="text-[10px] underline" onClick={() => onFollow(profile)}>unfollow</button></div>)}</div><div className="mt-6 border-t-2 border-ink pt-4 text-xs leading-5">Keep your circle intentional. A smaller network can make more room for actual conversations.</div></div></div></div>;
}

function ProfileView({ profile, session, onEdit }: { profile: Profile; session: Session | null; onEdit: () => void }) {
  return <div className="mx-auto max-w-4xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">your public profile</div><h1 className="hand-title mt-1 text-6xl">about me</h1></div><Button variant="default" onClick={onEdit}><Pencil /> make changes</Button></div><div className="grid gap-5 md:grid-cols-[0.75fr_1.25fr]"><div className="sketch-border bg-sky p-5"><Avatar profile={profile} tone="bg-coral" className="mx-auto size-32" textClass="text-7xl" /><div className="mt-5 text-center"><h2 className="hand-title text-4xl">{profile.display_name}</h2><p className="mt-1 text-xs">@{profile.handle}</p><div className="mt-4 inline-flex items-center gap-1 border-2 border-ink bg-panel px-2 py-1 text-[10px]"><Globe2 className="size-3" /> {profile.location}</div></div></div><div className="ruled-paper sketch-border bg-panel p-5"><div className="font-mono text-[10px] uppercase">a few words</div><p className="mt-3 max-w-xl text-lg leading-8">{profile.bio}</p><div className="mt-7 grid gap-5 sm:grid-cols-2"><div><div className="font-mono text-[10px] uppercase">interested in</div><div className="mt-2 flex flex-wrap gap-2">{profile.interests.map((item) => <span className="border-2 border-ink bg-butter px-2 py-1 text-xs" key={item}>{item}</span>)}</div></div><div><div className="font-mono text-[10px] uppercase">can help with</div><div className="mt-2 flex flex-wrap gap-2">{profile.skills.map((item) => <span className="border-2 border-ink bg-mint px-2 py-1 text-xs" key={item}>{item}</span>)}</div></div></div><div className="mt-7 flex items-center justify-between border-t-2 border-ink pt-4 text-[10px]"><span>timezone: {profile.timezone}</span><span className="flex items-center gap-1 text-signal"><span className="size-2 rounded-full bg-signal" /> {session ? "signed in" : "preview mode"}</span></div></div></div></div>;
}

function VideoRoom({ profile, session, connection, onCallStart, onCallEnd, onMessage, onClose }: { profile: Profile; session: Session | null; connection: ConnectionRecord | null; onCallStart: (connectionId: string, remoteId: string) => Promise<void>; onCallEnd: (seconds: number) => Promise<void>; onMessage: () => void; onClose: () => void }) {
  const rtc = useWebRtcRoom({
    roomId: connection?.id ?? null,
    userId: session?.user.id ?? null,
    remoteId: profile.id,
    ...(connection ? { onCallStarted: () => onCallStart(connection.id, profile.id) } : {}),
    onCallEnded: (seconds) => onCallEnd(seconds),
  });
  return <div className="mx-auto max-w-5xl"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">face to face</div><h1 className="hand-title mt-1 text-6xl">video room</h1></div><Button variant="outline" onClick={() => { void rtc.stop(); onClose(); }}><X /> close room</Button></div><div className="grid gap-4 lg:grid-cols-[1fr_260px]"><div className="window-chrome overflow-hidden bg-ink p-3"><div className="relative aspect-video overflow-hidden border-2 border-panel bg-coral"><video ref={rtc.remoteVideo} autoPlay playsInline className={`absolute inset-0 h-full w-full object-cover ${rtc.started && rtc.hasRemoteVideo ? "" : "hidden"}`} /><div className={`absolute inset-0 flex flex-col items-center justify-center text-center ${rtc.started && rtc.hasRemoteVideo ? "hidden" : ""}`}><Avatar profile={profile} tone="bg-butter" className="size-28" textClass="text-7xl" /><div className="mt-3 hand-title text-4xl text-panel">{profile.display_name}</div><div className="text-[10px] uppercase text-panel/80">{rtc.status}</div></div><video ref={rtc.localVideo} muted autoPlay playsInline className="absolute bottom-3 right-3 aspect-video w-28 border-2 border-ink bg-ink object-cover" /></div><div className="flex flex-wrap items-center justify-center gap-2 pt-3"><Button variant={rtc.micOn ? "secondary" : "destructive"} size="icon" title={rtc.micOn ? "Mute microphone" : "Turn on microphone"} aria-label={rtc.micOn ? "Mute microphone" : "Turn on microphone"} onClick={rtc.toggleMic}>{rtc.micOn ? <Mic /> : <MicOff />}</Button><Button variant={rtc.videoOn ? "secondary" : "destructive"} size="icon" title={rtc.videoOn ? "Turn off camera" : "Turn on camera"} aria-label={rtc.videoOn ? "Turn off camera" : "Turn on camera"} onClick={rtc.toggleVideo}>{rtc.videoOn ? <Camera /> : <VideoOff />}</Button><Button variant="default" onClick={rtc.started ? () => void rtc.stop() : () => void rtc.start()}>{rtc.started ? <VideoOff /> : <Video />} {rtc.started ? "leave room" : "start camera"}</Button><Button variant="ghost" size="icon" title="Message this person" aria-label="Message this person" onClick={onMessage}><MessageCircle /></Button></div>{rtc.error && <div className="mt-3 border-2 border-signal bg-butter px-3 py-2 text-xs">{rtc.error}</div>}</div><div className="sketch-border bg-panel p-4"><div className="mb-4 flex items-center justify-between"><span className="font-mono text-[10px] uppercase">room notes</span><Laptop className="size-4" /></div><div className="hand-title text-3xl">start with a good question.</div><p className="mt-3 text-xs leading-5">What are you making space for this year?</p><div className="mt-6 border-t-2 border-ink pt-4 text-xs leading-5"><b>room rules</b><br />camera optional<br />no recording<br />leave kindly</div></div></div></div>;
}

function AuthModal({ mode, setMode, email, setEmail, password, setPassword, name, setName, message, busy, onSubmit, onGoogle, onClose }: { mode: AuthMode; setMode: (mode: AuthMode) => void; email: string; setEmail: (value: string) => void; password: string; setPassword: (value: string) => void; name: string; setName: (value: string) => void; message: string; busy: boolean; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onGoogle: () => void; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"><div className="sketch-border w-full max-w-md bg-panel p-5"><div className="mb-5 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase">welcome to the network</div><h2 className="hand-title mt-1 text-5xl">{mode === "login" ? "good to see you." : "come on in."}</h2></div><button onClick={onClose} aria-label="Close sign in"><X /></button></div><div className="mb-4 flex border-b-2 border-ink"><button className={`flex-1 pb-2 text-xs font-medium ${mode === "login" ? "border-b-4 border-signal" : ""}`} onClick={() => setMode("login")}>sign in</button><button className={`flex-1 pb-2 text-xs font-medium ${mode === "signup" ? "border-b-4 border-signal" : ""}`} onClick={() => setMode("signup")}>make an account</button></div><form onSubmit={onSubmit} className="space-y-3">{mode === "signup" && <label className="block text-xs">display name<input required value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none focus:shadow-[2px_2px_0_var(--color-ink)]" placeholder="your name" /></label>}<label className="block text-xs">email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none focus:shadow-[2px_2px_0_var(--color-ink)]" placeholder="you@example.com" /></label><label className="block text-xs">password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none focus:shadow-[2px_2px_0_var(--color-ink)]" placeholder="at least 6 characters" /></label>{message && <div className="border-2 border-ink bg-butter px-3 py-2 text-xs leading-5">{message}</div>}<Button type="submit" className="w-full" disabled={busy}>{busy ? "one moment..." : mode === "login" ? "enter global link" : "create my profile"}</Button></form><div className="my-4 flex items-center gap-2 text-[10px] uppercase"><span className="h-px flex-1 bg-ink" /> or <span className="h-px flex-1 bg-ink" /></div><Button variant="outline" className="w-full" onClick={onGoogle} disabled={busy}><Globe2 /> continue with Google</Button><p className="mt-4 text-center text-[10px] leading-4">Be thoughtful with the details you share. You can change your profile anytime.</p></div></div>;
}

function ProfileEditor({ profile, onSave, onClose, onUploadAvatar }: { profile: Profile; onSave: (profile: Profile) => void; onClose: () => void; onUploadAvatar: (file: File) => Promise<string | null> }) {
  const [draft, setDraft] = useState(profile);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const url = await onUploadAvatar(file);
    setUploading(false);
    if (url) setDraft((current) => ({ ...current, avatar_url: url }));
  };
  const update = (key: keyof Profile, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"><div className="sketch-border max-h-[90vh] w-full max-w-2xl overflow-y-auto bg-panel p-5"><div className="mb-5 flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase">profile maker</div><h2 className="hand-title mt-1 text-5xl">make it yours.</h2></div><button onClick={onClose} aria-label="Close profile editor"><X /></button></div><div className="mb-4 flex items-center gap-4 border-2 border-ink bg-butter/60 p-3">{draft.avatar_url ? <img src={draft.avatar_url} alt="Your profile photo" className="avatar-ink size-20 rounded-full object-cover" /> : <div className="avatar-ink flex size-20 items-center justify-center rounded-full bg-panel font-display text-4xl">{draft.display_name[0]}</div>}<div><div className="font-mono text-[10px] uppercase">your photo</div><input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => { void pickPhoto(event.target.files?.[0]); event.target.value = ""; }} /><Button className="mt-2" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}><Upload /> {uploading ? "uploading..." : draft.avatar_url ? "change photo" : "upload photo"}</Button>{draft.avatar_url && <button className="ml-2 text-[10px] uppercase underline underline-offset-4" onClick={() => setDraft((current) => ({ ...current, avatar_url: null }))}>remove</button>}</div></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs">display name<input value={draft.display_name} onChange={(event) => update("display_name", event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label><label className="text-xs">handle<input value={draft.handle} onChange={(event) => update("handle", event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label><label className="text-xs">where are you?<input value={draft.location ?? ""} onChange={(event) => update("location", event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label><label className="text-xs">your timezone<input value={draft.timezone ?? ""} onChange={(event) => update("timezone", event.target.value)} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label></div><label className="mt-3 block text-xs">a few words<textarea value={draft.bio ?? ""} onChange={(event) => update("bio", event.target.value)} className="mt-1 min-h-28 w-full border-2 border-ink bg-paper p-3 text-sm leading-6 outline-none" /></label><label className="mt-3 block text-xs">interests <span className="text-ink/60">(separate with commas)</span><input value={draft.interests.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, interests: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label><label className="mt-3 block text-xs">can help with <span className="text-ink/60">(separate with commas)</span><input value={draft.skills.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, skills: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} className="mt-1 h-11 w-full border-2 border-ink bg-paper px-3 text-sm outline-none" /></label><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>cancel</Button><Button onClick={() => onSave(draft)}><Check /> save profile</Button></div></div></div>;
}

function OpeningAnimation({ onSkip }: { onSkip: () => void }) {
  return <div className="opening-screen fixed inset-0 z-[70] flex items-center justify-center bg-paper px-5" role="status" aria-label="Opening Global Link"><div className="opening-window sketch-border w-full max-w-xl bg-panel p-4 sm:p-6"><div className="flex items-center gap-2 border-b-2 border-ink bg-butter px-3 py-2"><span className="size-3 rounded-full border-2 border-ink bg-signal" /><span className="size-3 rounded-full border-2 border-ink bg-mint" /><span className="size-3 rounded-full border-2 border-ink bg-sky" /><span className="ml-auto font-mono text-[10px] uppercase">global_link.exe</span></div><div className="px-4 py-10 text-center sm:py-14"><div className="mx-auto flex size-20 rotate-[-6deg] items-center justify-center border-2 border-ink bg-signal text-panel shadow-[4px_4px_0_var(--color-ink)]"><Link2 className="size-10" /></div><div className="hand-title mt-6 text-6xl sm:text-8xl">global link</div><p className="mt-3 text-xs uppercase tracking-[0.14em]">opening a smaller internet</p><div className="mt-7 h-3 overflow-hidden border-2 border-ink bg-paper"><div className="opening-progress h-full bg-signal" /></div></div><button className="block w-full text-center text-[10px] uppercase underline underline-offset-4" onClick={onSkip}>skip opening</button></div></div>;
}

function InboxView({ session, profiles, connections, messages, selectedPerson, selectedConnection, onSelect, onSend, onSignIn }: { session: Session | null; profiles: Profile[]; connections: string[]; messages: Message[]; selectedPerson: Profile; selectedConnection: ConnectionRecord | null; onSelect: (id: string) => void; onSend: (body: string) => Promise<void>; onSignIn: () => void }) {
  const [draft, setDraft] = useState("");
  const people = profiles.filter((profile) => connections.includes(profile.id));
  const thread = selectedConnection ? messages.filter((message) => message.connection_id === selectedConnection.id) : [];
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    await onSend(body);
    setDraft("");
  };
  return <div className="mx-auto max-w-5xl"><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em]">the quiet corner</div><h1 className="hand-title mt-1 text-6xl">inbox</h1></div>{!session && <Button onClick={onSignIn}><LogIn /> sign in to message</Button>}</div><div className="grid min-h-[520px] gap-4 lg:grid-cols-[250px_1fr]"><aside className="sketch-border bg-panel p-3"><div className="mb-3 border-b-2 border-ink pb-3 font-mono text-[10px] uppercase">your conversations</div>{people.length ? people.map((person, index) => <button key={person.id} className={`flex w-full items-center gap-2 border-b border-ink/25 p-2 text-left ${person.id === selectedPerson.id ? "bg-butter" : "hover:bg-sky/40"}`} onClick={() => onSelect(person.id)}><Avatar profile={person} tone={tones[index % tones.length] ?? "tone-coral"} className="size-9 shrink-0" textClass="text-lg" /><span className="min-w-0"><span className="block truncate text-xs font-medium">{person.display_name}</span><span className="block text-[9px]">@{person.handle}</span></span></button>) : <p className="p-3 text-xs leading-5">Connect with someone to start a conversation.</p>}</aside><section className="sketch-border flex min-h-[520px] flex-col bg-panel p-4"><div className="flex items-center gap-3 border-b-2 border-ink pb-3"><Avatar profile={selectedPerson} tone={tones[1] ?? "tone-sky"} className="size-11" textClass="text-2xl" /><div><div className="hand-title text-3xl">{selectedPerson.display_name}</div><div className="text-[10px]">{selectedPerson.location} · @{selectedPerson.handle}</div></div></div><div className="flex-1 space-y-3 overflow-y-auto py-4">{thread.length ? thread.map((message) => <div key={message.id} className={`flex ${message.sender_id === session?.user.id ? "justify-end" : "justify-start"}`}><div className={`max-w-[78%] border-2 border-ink px-3 py-2 text-xs leading-5 ${message.sender_id === session?.user.id ? "bg-sky" : "bg-butter"}`}>{message.body}<div className="mt-1 text-[9px] opacity-60">{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div></div>) : <div className="flex h-full items-center justify-center text-center"><div><MessageCircle className="mx-auto mb-2 size-7 text-signal" /><div className="hand-title text-3xl">say a thoughtful hello.</div><p className="mt-2 max-w-sm text-xs leading-5">Ask what they are learning, making, or noticing lately.</p></div></div>}</div><form onSubmit={(event) => void submit(event)} className="flex gap-2 border-t-2 border-ink pt-3"><input value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!session || !selectedConnection} placeholder={session ? "write something kind..." : "sign in to send a message"} className="h-11 min-w-0 flex-1 border-2 border-ink bg-paper px-3 text-xs outline-none focus:shadow-[2px_2px_0_var(--color-ink)]" /><Button type="submit" disabled={!session || !selectedConnection || !draft.trim()}><MessageCircle /> send</Button></form></section></div></div>;
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return <div className={`sketch-border bg-panel text-center ${compact ? "p-5" : "p-10"}`}><Sparkles className="mx-auto mb-2 size-6 text-signal" /><div className="hand-title text-3xl">no one here yet.</div><p className="mt-2 text-xs">Try a different search — the world is big.</p></div>;
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="sketch-border bg-panel p-4">
    <div className="font-mono text-[10px] uppercase tracking-[0.12em]">{label}</div>
    <div className="hand-title mt-1 text-5xl">{value}</div>
    <div className="mt-1 text-[11px] leading-4 text-ink/70">{hint}</div>
  </div>;
}

function DashboardView({ profile, session, profiles, connections, connectionRecords, following, messages, calls, onEdit, onInbox, onRoom, onSignIn, onAccept }: {
  profile: Profile;
  session: Session | null;
  profiles: Profile[];
  connections: string[];
  connectionRecords: ConnectionRecord[];
  following: string[];
  messages: Message[];
  calls: CallRecord[];
  onEdit: () => void;
  onInbox: (id?: string) => void;
  onRoom: (profile: Profile) => void;
  onSignIn: () => void;
  onAccept: (connectionId: string) => void;
}) {
  const byId = (id: string) => profiles.find((item) => item.id === id);
  const userId = session?.user.id ?? null;
  const pending = connectionRecords.filter((record) => record.status === "pending" && record.addressee_id === userId);
  const unread = messages.filter((message) => message.recipient_id === userId).length;
  const totalMinutes = Math.round(calls.reduce((sum, call) => sum + (call.duration_seconds ?? 0), 0) / 60);
  const people = profiles.filter((item) => connections.includes(item.id));

  return <div className="mx-auto max-w-6xl">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em]">your corner</div>
        <h1 className="hand-title mt-1 text-6xl">hello, {profile.display_name.split(" ")[0]}.</h1>
        <p className="mt-2 max-w-md text-xs leading-5">A quick look at your people, your messages and the time you've spent face to face.</p>
      </div>
      {session
        ? <Button variant="outline" onClick={onEdit}><Pencil /> edit profile</Button>
        : <Button onClick={onSignIn}><LogIn /> sign in to see yours</Button>}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile label="connections" value={String(connections.length)} hint="people you can call and message" />
      <StatTile label="following" value={String(following.length)} hint="people whose updates you keep" />
      <StatTile label="messages" value={String(unread)} hint="in your inbox right now" />
      <StatTile label="time together" value={`${totalMinutes}m`} hint={`across ${calls.length} video ${calls.length === 1 ? "call" : "calls"}`} />
    </div>

    <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="sketch-border bg-panel p-4">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em]">recent calls</span>
          <PhoneOff className="size-4" />
        </div>
        {calls.length === 0
          ? <div className="border-2 border-dashed border-ink/40 p-6 text-center text-xs leading-5">No calls yet. Pick someone from My people and open a video room.</div>
          : <ul className="grid gap-2">
              {calls.slice(0, 8).map((call) => {
                const otherId = call.caller_id === userId ? call.callee_id : call.caller_id;
                const other = byId(otherId);
                return <li key={call.id} className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink bg-paper px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{other?.display_name ?? "A member"}</div>
                    <div className="font-mono text-[10px] uppercase text-ink/70">{new Date(call.started_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="border-2 border-ink bg-butter px-2 py-1 font-mono text-[10px] uppercase">{formatDuration(call.duration_seconds)}</span>
                    {other && <Button size="sm" variant="outline" onClick={() => onRoom(other)}><Video /> call again</Button>}
                  </div>
                </li>;
              })}
            </ul>}
      </div>

      <div className="grid content-start gap-4">
        <div className="sketch-border bg-panel p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em]">requests waiting</div>
          {pending.length === 0
            ? <p className="text-xs leading-5">Nothing waiting. All caught up.</p>
            : <ul className="grid gap-2">
                {pending.map((record) => {
                  const other = byId(record.requester_id);
                  return <li key={record.id} className="flex items-center justify-between gap-2 border-2 border-ink bg-paper px-3 py-2">
                    <span className="text-sm">{other?.display_name ?? "A member"}</span>
                    <Button size="sm" onClick={() => onAccept(record.id)}><Check /> accept</Button>
                  </li>;
                })}
              </ul>}
        </div>

        <div className="sketch-border bg-panel p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.12em]">your people</div>
          {people.length === 0
            ? <p className="text-xs leading-5">Connect with someone in Discover to start here.</p>
            : <ul className="grid gap-2">
                {people.slice(0, 5).map((person) => <li key={person.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{person.display_name}</span>
                  <span className="flex gap-1">
                    <Button size="icon" variant="ghost" title={`Message ${person.display_name}`} aria-label={`Message ${person.display_name}`} onClick={() => onInbox(person.id)}><MessageCircle /></Button>
                    <Button size="icon" variant="ghost" title={`Call ${person.display_name}`} aria-label={`Call ${person.display_name}`} onClick={() => onRoom(person)}><Video /></Button>
                  </span>
                </li>)}
              </ul>}
        </div>
      </div>
    </div>
  </div>;
}
