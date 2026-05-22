/**
 * User Data Isolation Tests (v1.6)
 * Verify that user profile and vehicle data is properly isolated per user
 */

import { describe, it, expect } from "vitest";
import { reducer, initialState } from "../store-reducer";
import type { AppState, Vehicle } from "../types";

describe("User Data Isolation (v1.6)", () => {
  describe("LOAD_USER_DATA action", () => {
    it("should load user name and vehicles", () => {
      const vehicles: Vehicle[] = [
        {
          id: "v1",
          nickname: "Daily Driver",
          year: 2023,
          make: "Toyota",
          model: "Camry",
          color: "Silver",
          plate: "ABC123",
        },
      ];

      const state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "John Doe",
          vehicles,
          selectedVehicleId: "v1",
        },
      });

      expect(state.userName).toBe("John Doe");
      expect(state.vehicles).toEqual(vehicles);
      expect(state.selectedVehicleId).toBe("v1");
      expect(state.photoUrl).toBeNull();
    });

    it("should load avatar URL from profile", () => {
      const state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Jane",
          vehicles: [],
          selectedVehicleId: null,
          photoUrl: "https://example.com/avatar.jpg",
        },
      });

      expect(state.photoUrl).toBe("https://example.com/avatar.jpg");
    });

    it("should handle multiple vehicles", () => {
      const vehicles: Vehicle[] = [
        {
          id: "v1",
          nickname: "Work",
          year: 2022,
          make: "Honda",
          model: "Civic",
          color: "Blue",
          plate: "XYZ789",
        },
        {
          id: "v2",
          nickname: "Personal",
          year: 2021,
          make: "Ford",
          model: "Mustang",
          color: "Red",
          plate: "DEF456",
        },
      ];

      const state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Jane Smith",
          vehicles,
          selectedVehicleId: "v2",
        },
      });

      expect(state.vehicles).toHaveLength(2);
      expect(state.selectedVehicleId).toBe("v2");
    });

    it("should handle empty vehicle list", () => {
      const state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Bob Johnson",
          vehicles: [],
          selectedVehicleId: null,
        },
      });

      expect(state.vehicles).toHaveLength(0);
      expect(state.selectedVehicleId).toBeNull();
    });
  });

  describe("CLEAR_USER_DATA action", () => {
    it("should clear all user-specific data", () => {
      // Start with loaded user data
      let state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Alice",
          vehicles: [
            {
              id: "v1",
              nickname: "Car",
              year: 2023,
              make: "Tesla",
              model: "Model 3",
              color: "White",
              plate: "TSL001",
            },
          ],
          selectedVehicleId: "v1",
        },
      });

      expect(state.userName).toBe("Alice");
      expect(state.vehicles).toHaveLength(1);

      // Clear user data
      state = reducer(state, { type: "CLEAR_USER_DATA" });

      expect(state.userName).toBe("Alex");
      expect(state.vehicles).toHaveLength(0);
      expect(state.selectedVehicleId).toBeNull();
      expect(state.jobs).toHaveLength(0);
      expect(state.activeJobId).toBeNull();
      expect(state.paymentMethods).toHaveLength(0);
      expect(state.defaultPaymentMethodId).toBeNull();
    });

    it("should clear jobs and mechanic jobs", () => {
      // Start with user data and jobs
      let state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Charlie",
          vehicles: [],
          selectedVehicleId: null,
        },
      });

      // Add a job
      state = reducer(state, {
        type: "CREATE_JOB",
        payload: {
          id: "job1",
          mechanicId: "mech1",
          vehicleId: "v1",
          service: "oil_change",
          location: "123 Main St",
          status: "searching",
          createdAt: Date.now(),
          fare: { base: 50, service: 10, distance: 5, total: 65 },
        },
      });

      expect(state.jobs).toHaveLength(1);
      expect(state.activeJobId).toBe("job1");

      // Clear user data
      state = reducer(state, { type: "CLEAR_USER_DATA" });

      expect(state.jobs).toHaveLength(0);
      expect(state.activeJobId).toBeNull();
    });

    it("should preserve location and region preferences after clear", () => {
      // Start with location and region
      let state = reducer(initialState, {
        type: "SET_DEFAULT_LOCATION",
        payload: "123 Main St, SF",
      });

      state = reducer(state, {
        type: "SET_DETECTED_COUNTRY",
        payload: "US",
      });

      state = reducer(state, {
        type: "SET_REGION_PREFERENCE",
        payload: "US",
      });

      // Load user data
      state = reducer(state, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "David",
          vehicles: [],
          selectedVehicleId: null,
        },
      });

      // Clear user data
      state = reducer(state, { type: "CLEAR_USER_DATA" });

      // Location and region should be preserved
      expect(state.defaultLocation).toBe("123 Main St, SF");
      expect(state.detectedCountry).toBe("US");
      expect(state.regionPreference).toBe("US");
    });
  });

  describe("User switching scenario", () => {
    it("should switch between two users without data leakage", () => {
      const user1Vehicles: Vehicle[] = [
        {
          id: "u1v1",
          nickname: "User1 Car",
          year: 2023,
          make: "Toyota",
          model: "Camry",
          color: "Silver",
          plate: "U1CAR",
        },
      ];

      const user2Vehicles: Vehicle[] = [
        {
          id: "u2v1",
          nickname: "User2 Car",
          year: 2022,
          make: "Honda",
          model: "Civic",
          color: "Blue",
          plate: "U2CAR",
        },
        {
          id: "u2v2",
          nickname: "User2 Truck",
          year: 2021,
          make: "Ford",
          model: "F-150",
          color: "Red",
          plate: "U2TRUCK",
        },
      ];

      // Load User 1
      let state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "User One",
          vehicles: user1Vehicles,
          selectedVehicleId: "u1v1",
        },
      });

      expect(state.userName).toBe("User One");
      expect(state.vehicles).toHaveLength(1);
      expect(state.selectedVehicleId).toBe("u1v1");

      // Clear User 1
      state = reducer(state, { type: "CLEAR_USER_DATA" });

      expect(state.userName).toBe("Alex");
      expect(state.vehicles).toHaveLength(0);

      // Load User 2
      state = reducer(state, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "User Two",
          vehicles: user2Vehicles,
          selectedVehicleId: "u2v2",
        },
      });

      expect(state.userName).toBe("User Two");
      expect(state.vehicles).toHaveLength(2);
      expect(state.selectedVehicleId).toBe("u2v2");
      expect(state.vehicles.find((v) => v.id === "u1v1")).toBeUndefined();
      expect(state.vehicles.find((v) => v.id === "u2v1")).toBeDefined();
    });
  });

  describe("Vehicle operations after LOAD_USER_DATA", () => {
    it("should allow adding vehicles to loaded user data", () => {
      let state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Eve",
          vehicles: [
            {
              id: "v1",
              nickname: "Car1",
              year: 2023,
              make: "Tesla",
              model: "Model 3",
              color: "White",
              plate: "TSL001",
            },
          ],
          selectedVehicleId: "v1",
        },
      });

      // Add another vehicle
      state = reducer(state, {
        type: "ADD_VEHICLE",
        payload: {
          id: "v2",
          nickname: "Car2",
          year: 2022,
          make: "BMW",
          model: "X5",
          color: "Black",
          plate: "BMW001",
        },
      });

      expect(state.vehicles).toHaveLength(2);
      expect(state.vehicles.find((v) => v.id === "v2")).toBeDefined();
    });

    it("should allow selecting vehicles from loaded data", () => {
      let state = reducer(initialState, {
        type: "LOAD_USER_DATA",
        payload: {
          userName: "Frank",
          vehicles: [
            {
              id: "v1",
              nickname: "Car1",
              year: 2023,
              make: "Tesla",
              model: "Model 3",
              color: "White",
              plate: "TSL001",
            },
            {
              id: "v2",
              nickname: "Car2",
              year: 2022,
              make: "BMW",
              model: "X5",
              color: "Black",
              plate: "BMW001",
            },
          ],
          selectedVehicleId: "v1",
        },
      });

      expect(state.selectedVehicleId).toBe("v1");

      // Switch to v2
      state = reducer(state, {
        type: "SELECT_VEHICLE",
        payload: "v2",
      });

      expect(state.selectedVehicleId).toBe("v2");
    });
  });
});
