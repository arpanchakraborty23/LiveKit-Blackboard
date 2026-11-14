import { NextResponse } from 'next/server';
import { AccessToken, type VideoGrant } from 'livekit-server-sdk';
import { RoomAgentDispatch, RoomConfiguration } from '@livekit/protocol';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const AGENT_NAME = process.env.AGENT_NAME ?? 'my-agent';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST() {
  if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
    return NextResponse.json(
      { error: 'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET in ui/.env.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const roomName = `room_${Math.random().toString(36).slice(2, 10)}`;
  const participantName = 'user';
  const participantIdentity = `user_${Math.random().toString(36).slice(2, 10)}`;

  const at = new AccessToken(API_KEY, API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    ttl: '15m',
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  at.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })],
  });

  const participantToken = await at.toJwt();

  return NextResponse.json(
    { serverUrl: LIVEKIT_URL, roomName, participantName, participantToken },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
