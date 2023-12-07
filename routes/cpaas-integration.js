"use-strict";
const AWS = require("aws-sdk");
const { v4: uuid } = require("uuid");
const OpenTok = require("opentok");

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

async function opentok() {
  return new Promise((resolve, reject) => {
    const opentok = new OpenTok(
      process.env.OPENTOK_API_KEY,
      process.env.OPENTOK_API_SECRET
    );

    opentok.createSession((err, session) => {
      token = session.generateToken();

      resolve({
        apiKey: process.env.OPENTOK_API_KEY,
        sessionId: session.sessionId,
        token,
      });
    });
  });
}

module.exports = async function (fastify, opts) {
  fastify.get(
    "/cpaas-integration/meeting-session",
    async function (request, reply) {
      let response = {};
      switch (request.query.cpaas) {
        case "chimesdk":
          response = await amazonChimeSdk(request.query.room);
          break;
        case "opentok":
          response = await opentok();
          break;
      }

      return response;
    }
  );
};
