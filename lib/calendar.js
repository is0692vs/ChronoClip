/**
 * @file Google Calendar API related functions
 */

/**
 * Retrieves the OAuth 2.0 access token.
 *
 * @param {boolean} interactive - If true, prompts the user to grant access if necessary.
 * @returns {Promise<string>} The access token.
 * @throws {Error} If token retrieval fails.
 */
function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Creates an event in Google Calendar.
 *
 * @param {object} params - The event details.
 * @param {string} params.summary - The event title.
 * @param {string} [params.description] - The event description.
 * @param {object} params.start - The start time of the event.
 * @param {object} params.end - The end time of the event.
 * @param {string} [params.location] - The event location.
 * @param {string} [params.url] - The URL of the page where the event was created.
 * @param {string} [params.calendarId="primary"] - The calendar ID.
 * @param {string} [params.timezone="Asia/Tokyo"] - The timezone for the event.
 * @returns {Promise<object>} The created event object.
 */
async function createEvent({
  summary,
  description = '',
  start,
  end,
  location,
  url,
  calendarId = 'primary',
  timezone = 'Asia/Tokyo',
}) {
  // TODO: Get includeURL from storage
  const includeURL = true;
  if (includeURL && url) {
    description += `\n\nSource: ${url}`;
  }

  const event = {
    summary,
    description,
    start,
    end,
  };
  if (location) {
    event.location = location;
  }

  // Adjust for all-day events vs. timed events
  if (start.date && !start.dateTime) {
    event.start.timeZone = 'UTC';
    event.end.timeZone = 'UTC';
  } else {
    event.start.timeZone = timezone;
    event.end.timeZone = timezone;
  }

  const fetchWithRetry = async (isRetry = false) => {
    const token = await getAuthToken(!isRetry);
    const apiUrl = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (response.ok) {
      return response.json();
    }

    if (response.status === 401 && !isRetry) {
      const currentToken = await getAuthToken(false);
      if (currentToken) {
        await chrome.identity.removeCachedAuthToken({ token: currentToken });
      }
      return fetchWithRetry(true); // Retry once
    }

    const errorData = await response.json();
    const errorMessage = errorData.error?.message || `HTTP error! status: ${response.status}`;
    const reason = errorData.error?.errors?.[0]?.reason || 'unknown';
    const err = new Error(errorMessage);
    err.code = response.status;
    err.reason = reason;
    throw err;
  };

  return fetchWithRetry();
}
