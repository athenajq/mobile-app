/**
 * @file Manages home screen (main screen once user is signed in).
 * @author Emily Sturman <emily@sturman.org>
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AnimatedTouchable from "../../../components/AnimatedTouchable";
import Card from "../../../components/orders/Card";
import Header from "../../../components/Header";
import Layout from "../../../constants/Layout";
import Colors from "../../../constants/Colors";
import { deleteOrder, focusOrder, unfocusOrder, logOut, watchOrders } from "../../../redux/Actions";
import { connect } from "react-redux";
import Alert from "../../../constants/Alert";
import reportToSentry from "../../../constants/Sentry";
import { toReadable, toSimple, parseISO } from "../../../constants/Date";
import {getUserLunchSchedule, OrderScheduleTypes} from "../../../constants/Schedule";

/**
 * Renders app home screen.
 *
 * @param {Object[]}                 [orders=[]]       Array of user's upcoming orders sorted in chronological order (soonest to farthest).
 * @param {Object}                   [orderPresets={}] Object containing user's order presets.
 * @param {Object}                   dynamicMenu       Whether menu is dynamic (changes weekly).
 * @param {Object[]}                 orderOptions      Array of order options.
 * @param {Object}                   orderSchedule     Contains data for ordering days.
 * @param {Object}                   lunchSchedule     Contains data for lunch days.
 * @param {string}                   uid               Unique user ID (generated by Firebase Auth).
 * @param {string}                   domain            Domain key for user's domain.
 * @param {function()}               logOut            Function to log user out.
 * @param {function(string)}         focusOrder        Function to focus a specific order in state.
 * @param {function()}               unfocusOrder      Function to unfocus all orders in state.
 * @param {function(string, string)} deleteOrder       Function to delete an order.
 * @param {function}                 watchOrders       Function to create listener in user's orders collection.
 * @param {Object}                   navigation        Navigation object (passed by React Navigation).
 *
 * @return {React.ReactElement} Element to render.
 * @constructor
 */
const HomeScreen = ({ orders = [], orderPresets = {}, dynamicMenu, orderSchedule, lunchSchedule, uid, logOut, focusOrder, unfocusOrder, deleteOrder, watchOrders, domain, navigation }) => {
  const editUser = () => {
    if (dynamicMenu) {
      navigation.navigate("User Settings");
    } else {
      navigation.navigate("Settings")
    }
  };

  // Opens the order screen for a new order.
  const newOrder = () => {
    if (dynamicMenu || Object.keys(orderPresets).length === 0) {
      navigation.navigate("Order", { screen: "Custom Order"});
    } else {
      navigation.navigate("Order")
    }
  };

  // Opens the order screen to edit an order.
  const focusOrderNavigate = (id, hasTitle, index) => {
    if (index && index < 0) {
      Alert("Cannot edit order", "It is too late to edit this order.");
      return;
    }
    focusOrder(id);
    if (hasTitle && !dynamicMenu) {
      navigation.navigate("Order", { screen: "Preset Order" });
    } else {
      navigation.navigate("Order", { screen: "Custom Order" });
    }
  };

  // Creates listeners for user's orders collection, popping screen (for log out), and focusing screen (for unfocusing an order).
  useEffect(() => {
    const unsubscribeFromWatchOrders = watchOrders(uid, domain, orderSchedule, lunchSchedule);
    const unsubscribeFromListener = navigation.addListener("beforeRemove", (e) => {
      if (e.data.action.type === "POP") {
        unsubscribeFromWatchOrders();
        logOut();
      }
    });
    return () => {
      unsubscribeFromWatchOrders();
      unsubscribeFromListener();
    }
  }, [navigation]);

  // Unfocuses orders when page loads
  useEffect(() => navigation.addListener("focus", () => unfocusOrder()), [navigation]);

  return (
    <View style={styles.container}>
      <Header
        title={"Home"}
        style={styles.header}
        leftButton={{ name: "log-out-outline", style: styles.logOutIcon, onPress: () => navigation.pop() }}
        rightButton={{ name: "settings-outline", onPress: editUser }}
      >
        <AnimatedTouchable style={styles.placeOrderButton} endOpacity={1} onPress={newOrder}>
          <Text style={styles.placeOrderButtonText}>Place an order</Text>
        </AnimatedTouchable>
      </Header>
      <FlatList
        ListEmptyComponent={() => <Text style={styles.emptyText}>No orders to display</Text>}
        data={orders}
        keyExtractor={(_, index) => index.toString()}
        renderItem={({ item }) =>
          <Card
            title={item.title}
            date={item.date}
            data={item.data}
            onPress={() => focusOrderNavigate(item.key, !!item.title, item.index)}
            onDelete={() => deleteOrder(item.keys || item.key, domain)}
            {...item}
          />
        }
        contentContainerStyle={[styles.contentContainer, { paddingBottom: useSafeAreaInsets().bottom }]}
        style={styles.flatList}
      />
    </View>
  )
};

/**
 * Gets array of user's future orders sorted chronologically.
 *
 * Converts order object to array, then filters out past orders and
 * sorts by date (soonest to farthest).
 *
 * @param {Object}  orders          Object containing all of user's orders.
 * @param {boolean} dynamicSchedule Whether order schedule is dynamic or static/daily.
 *
 * @return {Object[]} Array of order objects to be displayed on Home Screen.
 */
const getOrdersArr = (orders, dynamicSchedule) => {
  if (!dynamicSchedule) {
    return Object.values(orders)
      .sort((orderA, orderB) => parseISO(orderA.date).diff(orderB.date))
      .map((order) => ({ ...order, date: toReadable(order.date) }));
  }
  return Object.values(orders)
    .sort((orderA, orderB) => parseISO(orderA.date[0]).diff(orderB.date[0]))
    .map(({ date, key, keys, multipleOrders, ...orderGroups }) => ({
      date: `${toSimple(date[0])} to ${toSimple(date[date.length - 1])}`,
      key,
      keys,
      multipleOrders,
      data: Object.values(orderGroups)
        .sort((orderA, orderB) => parseISO(orderA.date).diff(orderB.date))
        .map((order) => ({ ...order, date: toReadable(order.date) }))
    }));
};

const mapStateToProps = ({ orders, orderPresets, stateConstants, user, domain }) => ({
  orders: getOrdersArr(orders, stateConstants.orderSchedule?.scheduleType === OrderScheduleTypes.CUSTOM),
  orderPresets,
  dynamicMenu: stateConstants.orderOptions.dynamic,
  orderSchedule: stateConstants.orderSchedule,
  lunchSchedule: getUserLunchSchedule(stateConstants.lunchSchedule, user || {}),
  uid: user?.uid,
  domain: domain.id
});

const mapDispatchToProps = (dispatch) => ({
  logOut: () => logOut(dispatch),
  focusOrder: (id) => dispatch(focusOrder(id)),
  unfocusOrder: () => dispatch(unfocusOrder()),
  deleteOrder: (id, domain) => deleteOrder(dispatch, id, domain),
  watchOrders: (uid, domain, orderSchedule, lunchSchedule) => watchOrders(dispatch, uid, domain, orderSchedule, lunchSchedule)
})

export default connect(mapStateToProps, mapDispatchToProps)(HomeScreen);

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundColor,
    flex: 1
  },
  header: {
    paddingBottom: 15 + Layout.placeOrderButton.height / 2
  },
  placeOrderButton: {
    backgroundColor: Colors.accentColor,
    borderRadius: 100,
    width: Layout.window.width - Layout.placeOrderButton.horizontalPadding,
    height: Layout.placeOrderButton.height,
    justifyContent: "center",
    alignItems: "center",
    position: "absolute",
    bottom: -Layout.placeOrderButton.height / 2,
    left: Layout.placeOrderButton.horizontalPadding / 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 2
  },
  placeOrderButtonText: {
    color: Colors.textOnBackground,
    fontFamily: "josefin-sans-bold",
    fontSize: Layout.fonts.title,
    textAlign: "center"
  },
  logOutIcon: {
    transform: [{ rotate: "180deg" }]
  },
  flatList: {
    backgroundColor: Colors.scrollViewBackground
  },
  contentContainer: {
    padding: 10,
    paddingTop: Layout.placeOrderButton.height / 2 + 10
  },
  emptyText: {
    color: Colors.primaryText,
    fontSize: Layout.fonts.body,
    textAlign: "center",
    fontFamily: "josefin-sans",
    marginTop: 20
  }
});