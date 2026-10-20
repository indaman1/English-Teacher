import { AnimatedTeacherAvatar } from '@/components/avatar/AnimatedTeacherAvatar';
import { avatarStateFor } from '@/components/avatar/avatarTypes';
import type { VoiceState } from '@/features/voice/voiceStateMachine';

interface TeacherAvatarProps {
  state: VoiceState;
  muted?: boolean;
  getMicLevel?: () => number;
  getAiLevel?: () => number;
}

const zero = () => 0;

/** Connects the live voice state and real audio levels to the animated teacher. */
export function TeacherAvatar({ state, muted = false, getMicLevel = zero, getAiLevel = zero }: TeacherAvatarProps) {
  return <AnimatedTeacherAvatar state={avatarStateFor(state, muted)} getMicLevel={getMicLevel} getAiLevel={getAiLevel} />;
}
