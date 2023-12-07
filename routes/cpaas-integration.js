"use-strict";
const AWS = require("aws-sdk");
const { v4: uuid } = require("uuid");
const OpenTok = require("opentok");
const Twilio = require("twilio");

async function twilio(uniqueName) {
  // initialize twilio instance
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const apiKey = process.env.TWILIO_API_KEY;
  const apiSecret = process.env.TWILIO_API_SECRET;

  const client = Twilio(accountSid, authToken);
  const AccessToken = Twilio.jwt.AccessToken;
  const VideoGrant = AccessToken.VideoGrant;

  const foundRooms = await client.video.v1.rooms.list({
    uniqueName,
  });

  const foundRoom = foundRooms[0];

  const createdRoom =
    !foundRoom && (await client.video.v1.rooms.create({ uniqueName }));

  const room = foundRoom ? foundRoom : createdRoom;

  const identity = uuid();

  const videoGrant = new VideoGrant({ room: uniqueName });

  const token = new AccessToken(accountSid, apiKey, apiSecret, { identity });

  token.addGrant(videoGrant);

  return {
    token: token.toJwt(),
  };
}

async function amazonChimeSdk(room) {
  // initialize Chime instance
  const chime = new AWS.Chime({ region: "us-east-1" });
  chime.endpoint = new AWS.Endpoint("https://service.chime.aws.amazon.com");

  // Retrieve Meetings list
  const meetingsResult = await chime.listMeetings().promise();

  // Can find a Meeting with a specific "external id" (aka, "room")?
  const foundMeeting = Array.from(meetingsResult.Meetings).find(
    (it) => it.ExternalMeetingId === room
  );

  // If not, create a new Meeting info.
  const createdMeetingResponse =
    !foundMeeting &&
    (await chime
      .createMeeting({
        ClientRequestToken: uuid(),
        MediaRegion: "us-east-1",
        ExternalMeetingId: room,
      })
      .promise());

  // ... or use the found meeting data
  const meetingResponse = foundMeeting
    ? { Meeting: foundMeeting }
    : createdMeetingResponse;

  // create Attendee info using the existing Meeting info.
  const attendeeResponse = await chime
    .createAttendee({
      MeetingId: meetingResponse.Meeting.MeetingId,
      ExternalUserId: uuid(),
    })
    .promise();

  // Respond with these infos so the frontend can safely use it
  return {
    attendeeResponse,
    meetingResponse,
  };
}

const opentokSessions = [];
async function opentok(room) {
  const opentok = new OpenTok(
    process.env.OPENTOK_API_KEY,
    process.env.OPENTOK_API_SECRET
  );

  const foundSession = opentokSessions.find((it) => it.room === room);

  const createdSession =
    !foundSession &&
    (await new Promise((resolve, reject) =>
      opentok.createSession((err, session) => {
        if (err) reject(err);

        resolve(session);
      })
    ));
  if (createdSession) {
    opentokSessions.push({ room, session: createdSession });
  }

  const session = foundSession ? foundSession.session : createdSession;

  const token = session.generateToken();

  return {
    apiKey: process.env.OPENTOK_API_KEY,
    sessionId: session.sessionId,
    token,
  };
}

module.exports = async function (fastify, opts) {
  fastify.get(
    "/cpaas-integration/meeting-session",
    async function (request, reply) {
      let response = {};
      const room = request.query.room
      switch (request.query.cpaas) {
        case "twilio":
          response = await twilio(room);
          break;
        case "chimesdk":
          response = await amazonChimeSdk(room);
          break;
        case "opentok":
          response = await opentok(room);
          break;
      }

      return response;
    }
  );
};
