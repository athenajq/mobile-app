/**
 * @file Handles actions to manipulate app state.
 * @author Emily Sturman <emily@sturman.org>
 */
import "react-native-get-random-values";
import Alert from "../constants/Alert";
import {
  firestore,
  auth,
  authErrorMessage,
  firestoreErrorMessage,
  deleteFailedUser,
  getUser
} from "../constants/Firebase";
import moment from "moment";
import {toISO, ISO_FORMAT, parseISO} from "../constants/Date";
import {
  OrderScheduleTypes,
  getLunchSchedule,
  getScheduleGroups,
  getCutoffDate, getValidOrderDates, isBeforeCutoff
} from "../constants/Schedule";

// All possible actions to edit state
const Actions = {
  UPDATE_ORDERS: "UPDATE_ORDERS",
  UPDATE_USER_DATA: "UPDATE_USER_DATA",
  UPDATE_CONSTANTS: "UPDATE_CONSTANTS",
  UPDATE_PRESETS: "UPDATE_PRESETS",
  FOCUS_ORDER: "FOCUS_ORDER",
  FOCUS_PRESET: "FOCUS_PRESET",
  SET_MODAL_PROPS: "SET_MODAL_PROPS",
  SET_INFO_MESSAGE: "SET_INFO_MESSAGE",
  SET_LOADING: "SET_LOADING",
  SET_DOMAIN: "SET_DOMAIN"
};

export default Actions;

const myDomain = (domain) => firestore.collection("domains").doc(domain);

/**
 * Firebase collection containing all orders (for pushing orders).
 * @param {string} domain Domain key for user's domain.
 * @return {CollectionReference} Reference to collection containing user's orders.
 */
const allOrders = (domain) => myDomain(domain).collection("orders");

/**
 * Firebase collection containing user's orders (for pulling orders).
 * @param {string} uid    Unique identifier for currently authenticated user.
 * @param {string} domain Domain key for user's domain.
 * @return {CollectionReference} Reference to collection containing user's orders.
 */
const myOrders = (uid, domain) => allOrders(domain).where("uid", "==", uid);

/**
 * Gets Firestore document containing user's profile information.
 * @param {string} uid    Unique identifier for currently authenticated user.
 * @param {string} domain Domain key for user's domain.
 * @return {DocumentReference<T>} Reference to document containing user's profile information.
 */
const myUserData = (uid, domain) => myDomain(domain).collection("userData").doc(uid);

/**
 * Gets Firebase collection containing user's order presets.
 * @param {string} uid    Unique identifier for currently authenticated user.
 * @param {string} domain Domain key for user's domain.
 * @return {CollectionReference} Reference to collection containing user's order presets.
 */
const myPresets = (uid, domain) => (
  myDomain(domain).collection("userData")
    .doc(uid)
    .collection("myPresets")
);

/**
 * Firebase collection for app state constants
 * @param {string} domain Domain key for user's domain.
 * @return {firebase.firestore.CollectionReference<firebase.firestore.DocumentData>} Reference to collection.
 */
const myAppData = (domain) => myDomain(domain).collection("appData");

/**
 * Opens an alert for an error provided by Firebase Auth.
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {auth.Error} error Error from Firebase Auth.
 */
const alertAuthError = (dispatch, error) => {
  dispatch(stopLoading());
  console.error(error);
  const { title, message } = authErrorMessage(error);
  Alert(title, message);
};

/**
 * Opens an alert for an error provided by Firestore.
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {Error} error Error from Firestore.
 */
const alertFirestoreError = (dispatch, error) => {
  dispatch(stopLoading());
  console.error(error);
  const { title, message } = firestoreErrorMessage(error);
  Alert(title, message);
};

/**
 * Action to execute on success of Firebase action.
 *
 * Stops app loading and displays a success message in
 * top-level info modal.
 *
 * @param {string}   message  Message to display in info modal.
 * @param {function} dispatch Dispatch function passed from Redux.
 */
const successAction = (message, dispatch) => {
  dispatch(stopLoading());
  dispatch(setInfoMessage(message));
};

/**
 * Creates a new sandwich order.
 *
 * Converts date to ISO format and pushes order data to Firebase.
 *
 * @param {function} dispatch        Dispatch function passed from Redux.
 * @param {Object}   data            Order data to push to Firebase.
 * @param {string}   data.date       Order date in readable format.
 * @param {string}   uid             ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain          Domain key for user's domain.
 * @param {boolean}  dynamicSchedule Whether order schedule is dynamic or static/daily.
 */
export const createOrder = (dispatch, data, uid, domain, dynamicSchedule) => {
  dispatch(startLoading());
  let dataToPush;
  if (!dynamicSchedule) {
    dataToPush = [{ ...data, date: toISO(data.date), uid }];
  } else {
    dataToPush = Object.keys(data)
      .filter((key) => key !== "date")
      .map((date) => ({ ...data[date], date, uid }));
  }
  const batch = firestore.batch();
  dataToPush.forEach((data) => {
    const dataRef = allOrders(domain).doc()
    batch.set(dataRef, data)
  });
  batch.commit()
    .then(() => successAction("Order created successfully", dispatch))
    .catch((error) => alertFirestoreError(dispatch, error));
};

// TODO FIXME
/**
 * Edits an existing sandwich order.
 *
 * Converts date to ISO format and pushes order to Firebase; edits
 * doc if date is the same, otherwise deletes old doc and creates
 * new with updated date.
 *
 * @param {function} dispatch  Dispatch function passed from Redux.
 * @param {Object}   data      Order data to push to Firebase.
 * @param {string}   data.date Order date in readable format.
 * @param {string[]} ids       IDs of orders being edited (generated by Firebase).
 * @param {string}   uid       ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain    Domain key for user's domain.
 */
export const editOrder = (dispatch, data, ids, uid, domain, dynamicSchedule) => {
  dispatch(startLoading());
  let dataToPush;
  if (!dynamicSchedule) {
    dataToPush = [{ ...data, date: toISO(data.date), uid }];
  } else {
    dataToPush = Object.keys(data)
      .filter((key) => key !== "date")
      .map((date) => ({ ...data[date], date, uid }));
  }
  const batch = firestore.batch();
  dataToPush.forEach(({ key, ...data }, i) => {
    const dataRef = allOrders(domain).doc(ids[i]);
    batch.set(dataRef, data);
  });
  batch.commit()
    .then(() => successAction("Order updated successfully", dispatch))
    .catch((error) => alertFirestoreError(dispatch, error));
};

/**
 * Deletes an existing sandwich order.
 *
 * Deletes doc corresponding to order from Firestore.
 *
 * @param {function}        dispatch Dispatch function passes from Redux.
 * @param {string|string[]} id       ID of order being edited generated by Firebase).
 * @param {string}          domain   Domain key for user's domain.
 */
export const deleteOrder = (dispatch, id, domain) => {
  dispatch(startLoading());
  const batch = firestore.batch();
  if (Array.isArray(id)) {
    id.forEach((key) => {
      const dataRef = allOrders(domain).doc(key);
      batch.delete(dataRef);
    });
  } else {
    const dataRef = allOrders(domain).doc(id);
    batch.delete(dataRef);
  }
  batch.commit()
    .then(() => successAction("Order deleted successfully", dispatch))
    .catch((error) => alertFirestoreError(dispatch, error));
};

/**
 * Creates a new order preset.
 *
 * Pushes preset to Firebase with order title as unique identifying key.
 *
 * @param {function} dispatch   Dispatch function passed from Redux.
 * @param {Object}   data       Order data to push to Firebase.
 * @param {string}   uid        ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain     Domain key for user's domain.
 */
export const createPreset = (dispatch, data, uid, domain) => {
  dispatch(startLoading());
  return (
    myPresets(uid, domain)
      .add(data)
      .then(() => successAction("Preset created successfully", dispatch))
      .catch((error) => alertFirestoreError(dispatch, error))
  );
};

/**
 * Edits an existing order preset.
 *
 * Edits doc if title is the same, otherwise deletes old doc and creates
 * new with updated title.
 *
 * @param {function} dispatch   Dispatch function passed from Redux.
 * @param {Object}   data       Preset data to push to Firebase.
 * @param {string}   data.title Title of order preset.
 * @param {string}   id         ID of order being edited (original title of preset).
 * @param {string}   uid        ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain     Domain key for user's domain.
 */
export const editPreset = (dispatch, data, id, uid, domain) => {
  dispatch(startLoading());
  let dataToPush = { ...data };
  delete dataToPush.key;
  return myPresets(uid, domain).doc(id)
    .set(dataToPush)
    .then(() => successAction("Preset updated successfully", dispatch))
    .catch((error) => alertFirestoreError(dispatch, error))
};

/**
 * Deletes an existing order preset.
 *
 * Deletes doc corresponding to preset from Firestore.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   id       ID of preset being edited (title of preset).
 * @param {string}   uid      ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain   Domain key for user's domain.
 */
export const deletePreset = (dispatch, id, uid, domain) => {
  dispatch(startLoading());
  return (
    myPresets(uid, domain).doc(id)
      .delete()
      .then(() => successAction("Preset deleted successfully", dispatch))
      .catch((error) => alertFirestoreError(dispatch, error))
  );
};

/**
 * Sets loading state of app to true.
 * @return {Object} Object to pass to dispatch function.
 */
export const startLoading = () => ({
  type: Actions.SET_LOADING,
  loading: true
})

/**
 * Sets loading state of app to false.
 * @return {Object} Object to pass to dispatch function.
 */
export const stopLoading = () => ({
  type: Actions.SET_LOADING,
  loading: false
})

/**
 * Sets focused order in app state to given ID.
 *
 * @param {string | number} id Unique order ID (date in ISO format).
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const focusOrder = (id) => ({
  type: Actions.FOCUS_ORDER,
  id: id.toString()
});

/**
 * Sets focused order in app state to null.
 * @return {Object} Object to pass to dispatch function.
 */
export const unfocusOrder = () => ({
  type: Actions.FOCUS_ORDER,
  id: null
});

/**
 * Sets focused preset in app state to given ID.
 *
 * @param {string} id Unique preset ID (title of preset).
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const focusPreset = (id) => ({
  type: Actions.FOCUS_PRESET,
  id
});

/**
 * Sets focused preset in app state to null.
 * @return {Object} Object to pass to dispatch function.
 */
export const unfocusPreset = () => ({
  type: Actions.FOCUS_PRESET,
  id: null
})

/**
 * Logs user in using provided auth credentials.
 *
 * Uses Firebase Auth's standard email/password account management
 * to authenticate user with given email address and password.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   email    User's email address.
 * @param {string}   password Password for user's account.
 */
export const logIn = (dispatch, email, password) => {
  dispatch(startLoading());
  auth().signInWithEmailAndPassword(email, password)
    .then(() => dispatch(stopLoading()))
    .catch((error) => alertAuthError(dispatch, error));
};

/**
 * Logs user out using Firebase Auth.
 * @param {function} dispatch Dispatch function passed from Redux.
 */
export const logOut = (dispatch) => {
  dispatch(startLoading());
  auth().signOut()
    .then(() => dispatch(stopLoading()))
    .catch((error) => alertAuthError(dispatch, error))
};

/**
 * Edits user's profile data.
 *
 * Updates doc corresponding to currently authenticated user
 * (identified through user ID).
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {Object}   data     Profile data to push to Firebase.
 * @param {string}   uid      ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain   Domain key for user's domain.
 */
export const editUserData = (dispatch, data, uid, domain) => {
  dispatch(startLoading());
  let newData = { ...data };
  delete newData.uid;
  delete newData.password;
  delete newData.email;
  delete newData.domain;
  return myUserData(uid, domain)
    .set(newData)
    .then(() => successAction("User data updated successfully", dispatch))
    .catch((error) => alertFirestoreError(dispatch, error));
};

const createUserDomain = async (domain, uid, dispatch) => {
  try {
    const docRef = firestore.collection("userDomains").doc(uid);
    await firestore.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      let domains = [];
      if (doc.exists) {
        domains = doc.data().domains || [doc.data().domain] || [];
      }
      const newDomains = [...domains, domain];
      t.set(docRef, { domains: newDomains });
    })
    await firestore.collection("userDomains").doc(uid).set({ domain });
  } catch (e) {
    await deleteFailedUser(uid, domain);
    alertFirestoreError(dispatch, e);
    logOut(dispatch);
  }
}

/**
 * Creates a new user.
 *
 * Creates user using Firebase Auth's email/password account management
 * and pushes profile information to Firestore.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   email    User's email address.
 * @param {string}   password Password for user's account.
 * @param {Object}   data     Profile information to push to Firebase.
 * @param {string}   domain   Domain key for user's domain.
 */
export const createUser = async (dispatch, email, password, data, domain) => {
  dispatch(startLoading());
  let uid;
  const catchFirestoreError = (e) => {
    deleteFailedUser(uid, domain);
    alertFirestoreError(dispatch, e);
    logOut(dispatch);
  }
  try {
    const existingUid = await getUser(email);
    if (existingUid) {
      uid = existingUid;
      const docRef = firestore.collection("userDomains").doc(existingUid);
      try {
        await firestore.runTransaction(async (t) => {
          const doc = await t.get(docRef);
          let domains = [];
          if (doc.exists) {
            domains = doc.data().domains || [doc.data().domain] || [];
          }
          if (domains.includes(domain)) {
            throw { code: "auth/email-already-in-use" };
          } else {
            const newDomains = [...domains, domain];
            t.set(docRef, { domains: newDomains });
          }
        })
        await editUserData(dispatch, data, uid, domain);
      } catch (e) {
        catchFirestoreError(e)
      }
      await auth().signInWithEmailAndPassword(email, password);
    } else {
      const userCredential = await auth().createUserWithEmailAndPassword(email, password);
      uid = userCredential.user.uid;
      await Promise.all([
        firestore.collection("userDomains").doc(uid)
          .set({ domains: [domain] }),
        editUserData(dispatch, data, uid, domain)
      ]).catch(catchFirestoreError)
    }
  } catch (e) {
    alertAuthError(dispatch, e);
    logOut(dispatch);
  }
}

/**
 * Opens top-level modal with provided props.
 *
 * @param {Object} props Props to pass to modal.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const openModal = (props) => ({
  type: Actions.SET_MODAL_PROPS,
  props: { ...props, open: true }
});

/**
 * Sets top-level modal props (without opening).
 *
 * @param {Object} props Props to pass to modal.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const setModalProps = (props) => ({
  type: Actions.SET_MODAL_PROPS,
  props
});

/**
 * Closes top-level modal.
 * @return {Object} Object to pass to dispatch function.
 */
export const closeModal = () => ({
  type: Actions.SET_MODAL_PROPS,
  props: { open: false }
});

/**
 * Sets message for top-level info modal.
 *
 * @param {string} message Message to be displayed in info modal.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const setInfoMessage = (message) => ({
  type: Actions.SET_INFO_MESSAGE,
  message
});

/**
 * Updates order state from data pulled from Firebase.
 *
 * Reads each doc from snapshot of orders collection and adds
 * to orders state.
 *
 * @param {QuerySnapshot<Object>} querySnapshot Collection snapshot from orders collection listener.
 * @param {Object}                orderSchedule Contains data for ordering days.
 * @param {Object}                lunchSchedule Contains data for lunch days.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const updateOrders = (querySnapshot, orderSchedule, lunchSchedule) => {
  const collectionData = {};
  const cutoffDate = getCutoffDate(orderSchedule);
  querySnapshot.forEach((doc) => {
    let data = { ...doc.data(), key: doc.id };
    delete data.uid;
    if (parseISO(data.date).isSameOrAfter(cutoffDate)) {
      collectionData[doc.id] = data;
    }
  })
  let orders = {};
  if (orderSchedule.scheduleType === OrderScheduleTypes.CUSTOM && Object.keys(collectionData).length > 0) {
    let dates = querySnapshot.docs.map((doc) => moment(doc.data().date));
    const availableScheduleGroups = getValidOrderDates(
      collectionData,
      null,
      orderSchedule,
      lunchSchedule,
      moment().format(ISO_FORMAT),
      moment.max(dates).format(ISO_FORMAT)
    );
    const allScheduleGroups = getScheduleGroups(
      getLunchSchedule(
        orderSchedule,
        lunchSchedule,
        moment().format(ISO_FORMAT),
        moment.max(dates).format(ISO_FORMAT)
      ),
      lunchSchedule.schedule
    );
    let includesCutoff = availableScheduleGroups.length > 0 &&
      !isBeforeCutoff(availableScheduleGroups[0], orderSchedule, lunchSchedule);
    const collectionDataKeys = Object.keys(collectionData);
    let index = includesCutoff ? -1 : 0;
    allScheduleGroups.forEach((group, i) => {
      // No orders will be on this day if it exists in availableScheduleGroups
      if (availableScheduleGroups.some((availableGroup) => availableGroup[0] === group[0])) {
        index++;
      } else {
        const relevantKeys = collectionDataKeys.filter((key) => group.includes(collectionData[key].date));
        if (relevantKeys.length > 0) {
          orders[i] = { date: group, key: i, index, keys: relevantKeys };
          for (const id of relevantKeys) {
            orders[i] = {
              ...orders[i],
              [collectionData[id].date]: collectionData[id]
            };
          }
        }
      }
    });
  } else {
    orders = collectionData;
  }
  return {
    type: Actions.UPDATE_ORDERS,
    orders
  };
};

/**
 * Updates preset state from data pulled from Firebase.
 *
 * Reads each doc from snapshot of presets collection and adds
 * to preset state.
 *
 * @param {QuerySnapshot<T>} querySnapshot Collection snapshot from preset collection listener.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const updatePresets = (querySnapshot) => {
  let presets = {};
  querySnapshot.forEach((doc) => {
    presets[doc.id] = {
      ...doc.data(),
      key: doc.id
    }
  });
  return {
    type: Actions.UPDATE_PRESETS,
    presets
  }
}

/**
 * Logs in user in app state (sets user object to empty object).
 * @return {Object} Object to pass to dispatch function.
 */
export const logInAction = () => ({
  type: Actions.UPDATE_USER_DATA,
  data: {}
})

/**
 * Updates profile data in app state.
 *
 * @param {string}              uid ID unique to authenticated user (generated by Firebase Auth).
 * @param {DocumentSnapshot<T>} doc Doc containing user data.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const updateUserData = (uid, doc) => ({
  type: Actions.UPDATE_USER_DATA,
  data: { uid, email: auth().currentUser.email, ...(doc.data() || {}) }
});

/**
 * Logs out user in app state (sets user object to null).
 * @return {Object} Object to pass to dispatch function.
 */
export const logOutAction = () => ({
  type: Actions.UPDATE_USER_DATA,
  data: null
});

/**
 * Sets a password reset email to given email address.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   email    Email address to send password reset email to.
 */
export const resetPassword = (dispatch, email) => {
  dispatch(startLoading());
  auth().sendPasswordResetEmail(email)
    .then(() => successAction("Email sent successfully", dispatch))
    .catch((error) => alertAuthError(dispatch, error));
};

/**
 * Re-authenticates user and changes user's account password.
 *
 * @param {function} dispatch        Dispatch function passed from Redux.
 * @param {string}   currentPassword User's current account password.
 * @param {string}   newPassword     User's new account password.
 */
export const changePassword = (dispatch, currentPassword, newPassword) => {
  dispatch(startLoading());
  const user = auth().currentUser;
  const credential = auth.EmailAuthProvider.credential(user.email, currentPassword);
  user.reauthenticateWithCredential(credential).then(() => (
    user.updatePassword(newPassword)
      .then(() => successAction("Password set successfully", dispatch))
      .catch((error) => alertAuthError(dispatch, error))
  )).catch((error) => alertAuthError(dispatch, error));
}

/**
 * Updates state constants with provided data.
 *
 * @param {Object} data   State constants data.
 *
 * @return {Object} Object to pass to dispatch function.
 */
export const updateConstants = (data) => ({
  type: Actions.UPDATE_CONSTANTS,
  data
});

/**
 * Creates listener for user's orders collection.
 *
 * @param {function} dispatch        Dispatch function passed from Redux.
 * @param {string}   uid             ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain          Domain key for user's domain.
 * @param {Object}                orderSchedule Contains data for ordering days.
 * @param {Object}                lunchSchedule Contains data for lunch days.
 *
 * @return {function} Function to unsubscribe listener.
 */
export const watchOrders = (dispatch, uid, domain, orderSchedule, lunchSchedule) => (
  myOrders(uid, domain).onSnapshot(
    (querySnapshot) => dispatch(updateOrders(querySnapshot, orderSchedule, lunchSchedule)),
    (error) => alertFirestoreError(dispatch, error)
  )
);

/**
 * Creates listener for user profile data.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   uid      ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain   Domain key for user's domain.
 *
 * @return {function} Function to unsubscribe listener.
 */
export const watchUserData = (dispatch, uid, domain) => (
  myUserData(uid, domain).onSnapshot(
    (doc) => dispatch(updateUserData(uid, doc)),
    (error) => alertFirestoreError(dispatch, error)
  )
);

/**
 * Creates listener for user's presets collection.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 * @param {string}   uid      ID unique to authenticated user (generated by Firebase Auth).
 * @param {string}   domain   Domain key for user's domain.
 *
 * @return {function} Function to unsubscribe listener.
 */
export const watchPresets = (dispatch, uid, domain) => (
  myPresets(uid, domain).onSnapshot(
    (querySnapshot) => dispatch(updatePresets(querySnapshot)),
    (error) => alertFirestoreError(dispatch, error)
  )
);

const setDomain = (domain) => ({
  type: Actions.SET_DOMAIN,
  domain
})

export const getUserDomain = async (uid, dispatch) => {
  dispatch(startLoading());
  let myDomainDoc = await firestore.collection("userDomains").doc(uid).get();
  const domainData = myDomainDoc.data();
  if (!myDomainDoc.exists || (!domainData.domains && !domainData.domain)) {
    await deleteFailedUser(uid);
    logOut(dispatch);
    throw new Error("User did not have a domain");
  }
  // TODO: Allow user to select which domain they want to use
  let domainId = domainData.domains ? domainData.domains[0] : domainData.domain;
  let domainDoc = await firestore.collection("domains").doc(domainId).get();
  dispatch(setDomain({ id: domainId, ...domainDoc.data() }));
  dispatch(stopLoading());
  return domainId;
}

export const getDomainByCode = async (dispatch, code) => {
  try {
    let fixedCode = code.trim().toUpperCase();
    let snapshot = await firestore.collection("domains")
      .where("code", "==", fixedCode)
      .limit(1)
      .get();
    if (snapshot.empty) {
      dispatch(setDomain(null));
      return null;
    } else {
      let domainDoc = snapshot.docs[0];
      dispatch(setDomain({ id: domainDoc.id, ...domainDoc.data() }));
      return domainDoc.id;
    }
  } catch (error) {
    alertFirestoreError(dispatch, error);
    throw new Error(error);
  }
}

/**
 * Creates listener for user authentication state (logged in or out).
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 *
 * @return {firebase.Unsubscribe} Function to unsubscribe listener.
 */
export const watchAuthState = (dispatch) => (
  auth().onAuthStateChanged((user) => {
    if (user) {
      dispatch(logInAction());
    } else {
      dispatch(logOutAction());
    }
  })
);

/**
 * Fetches data for app constants when user is not authenticated.
 *
 * @param {function} dispatch  Dispatch function passed from Redux.
 * @param {string}   code      6-digit code identifying organization.
 *
 * @return {Promise<boolean>} Promise for function.
 */
export const getUnauthData = async (dispatch, code) => {
  dispatch(startLoading());
  let domainId = await getDomainByCode(dispatch, code);
  let success = false;
  if (!domainId) {
    dispatch(stopLoading());
    Alert(
      "Invalid organization code",
      "We can't find any organization with that code. Are you sure you entered it correctly?"
    );
    return success;
  }
  try {
    let stateConstants = await getStateConstants(domainId);
    dispatch(updateConstants(stateConstants));
    success = true;
  } catch (error) {
    alertFirestoreError(dispatch, error);
    throw new Error(error);
  } finally {
    dispatch(stopLoading());
  }
  return success;
};

const getDynamicOrderOptions = async (domain) => {
  const validWeeks = (new Array(3))
    .fill(null)
    .map((_, i) => moment().day(i * 7).format(ISO_FORMAT));
  const querySnapshot = await myAppData(domain)
    .doc("orderOptions")
    .collection("dynamicMenu")
    .where("active", "array-contains-any", validWeeks) // Only include next 3 weeks (including this week)
    .get();
  const allOrderOptions = { dynamic: true };
  querySnapshot.forEach((doc) => {
    const { active, orderOptions } = doc.data();
    // One menu may contain multiple dates, but that date must be unique across all menus
    for (const date of active) {
      allOrderOptions[date] = orderOptions;
    }
  });
  return allOrderOptions
}

const getStateConstants = async (domain) => {
  let querySnapshot = await myAppData(domain).get();
  let constants = {
    userFields: [],
    orderOptions: {},
    lunchSchedule: {},
    orderSchedule: {}
  };
  for (const doc of querySnapshot.docs) {
    switch (doc.id) {
      case "userFields":
        constants[doc.id] = Object.values(doc.data() || {});
        break;
      case "orderOptions":
        const data = doc.data() || {};
        if (data.dynamic) {
          constants[doc.id] = await getDynamicOrderOptions(domain);
        } else {
          constants[doc.id] = data;
        }
        break;
      case "lunchSchedule":
      case "orderSchedule":
        constants[doc.id] = doc.data() || {};
        break;
      default:
        break;
    }
  }
  if (constants.lunchSchedule.dependent) {

  }
  return constants;
}

/**
 * Fetches data for app constants when user is authenticated.
 *
 * @param {function} dispatch Dispatch function passed from Redux.
 *
 * @return {Promise<Object>} Promise for data that was just fetched.
 */
export const getAuthData = async (dispatch) => {
  const uid = auth().currentUser.uid;
  try {
    let domainId = await getUserDomain(uid, dispatch);
    let results = await Promise.all([
      myOrders(uid, domainId).get(),
      myUserData(uid, domainId).get(),
      getStateConstants(domainId),
      myPresets(uid, domainId).get()
    ]);
    const [ordersSnapshot, userData, stateConstants, presetsSnapshot] = results;
    dispatch(updateOrders(ordersSnapshot, stateConstants.orderSchedule, stateConstants.lunchSchedule));
    dispatch(updateUserData(uid, userData));
    dispatch(updateConstants(stateConstants));
    dispatch(updatePresets(presetsSnapshot));
    return {
      user: userData.data(),
      userFields: stateConstants.userFields
    };
  } catch (e) {
    alertFirestoreError(dispatch, e);
    throw new Error(e);
  }
};