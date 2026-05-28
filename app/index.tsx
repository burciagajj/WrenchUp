/**
 * Customer Home Screen - Clean & Basic (No Map)
 */

import React from "react";
import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useStore, useSelectedVehicle } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { MechanicHome } from "@/components/mechanic-home";

export default function HomeScreen() {
  const { state } = useStore();
  const vehicle = useSelectedVehicle();

  // Show mechanic home if user is a mechanic
  if (state.role === "mechanic") {
    return <MechanicHome />;
  }

  const vehicleLabel = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    : "No vehicle selected";

  const handleRequestMechanic = () => {
    haptic.impact();
    router.push("/service-select" as any);
  };

  return (
    <ScreenContainer className="flex-1 bg-black">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Greeting */}
        <View className="pt-14 px-6 flex-row justify-between items-center">
          <View>
            <Text className="text-white text-3xl font-bold">
              Good evening, {state.userName || "Emi"} 👋
            </Text>
          </View>
          <Pressable onPress={() => router.push("/(tabs)/profile" as any)}>
            <Image
              source={{ uri: state.avatarUrl || "https://i.pravatar.cc/128" }}
              className="w-11 h-11 rounded-2xl border-2 border-orange-500"
            />
          </Pressable>
        </View>

        {/* Location & Vehicle Card */}
        <View className="mx-5 mt-8 bg-zinc-900 rounded-3xl p-6 border border-zinc-700">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <IconSymbol name="location.fill" size={24} color="#F97316" />
              <View className="flex-1">
                <Text className="text-zinc-400 text-xs tracking-widest">SERVICE LOCATION</Text>
                <Text className="text-white font-semibold" numberOfLines={1}>
                  3801 Alameda Avenue, El Paso
                </Text>
              </View>
            </View>
            <Pressable className="bg-orange-500 px-5 py-2 rounded-2xl">
              <Text className="text-white font-bold text-sm">Refresh</Text>
            </Pressable>
          </View>

          <View className="h-px bg-zinc-700 my-5" />

          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1">
              <IconSymbol name="car.fill" size={24} color="#F97316" />
              <View className="flex-1">
                <Text className="text-zinc-400 text-xs tracking-widest">VEHICLE</Text>
                <Text className="text-white font-semibold" numberOfLines={1}>
                  {vehicleLabel}
                </Text>
              </View>
            </View>
            <Pressable 
              onPress={() => router.push("/(tabs)/vehicles" as any)}
              className="px-6 py-2 border border-orange-500 rounded-2xl"
            >
              <Text className="text-orange-500 font-bold">Change</Text>
            </Pressable>
          </View>
        </View>

        {/* Big Request Button */}
        <View className="mx-5 mt-8">
          <Pressable
            onPress={handleRequestMechanic}
            className="bg-gradient-to-r from-orange-500 to-amber-500 py-7 rounded-3xl shadow-2xl flex-row items-center justify-center gap-3 active:scale-95"
          >
            <Text className="text-white text-2xl font-bold">Request a Mechanic</Text>
            <IconSymbol name="arrow.right" size={28} color="#fff" />
          </Pressable>
          <Text className="text-center text-zinc-400 text-sm mt-3">
            Mechanics nearby • Average 12 min arrival
          </Text>
        </View>

        {/* Quick Services */}
        <View className="mt-10 px-5">
          <Text className="text-white text-xl font-semibold mb-5">Quick services</Text>
          
          <View className="flex-row flex-wrap gap-3">
            <Pressable className="bg-zinc-900 flex-1 min-w-[48%] p-5 rounded-3xl border border-zinc-700">
              <IconSymbol name="bolt.fill" size={32} color="#F97316" />
              <Text className="text-white font-semibold mt-4">Battery Jump</Text>
              <Text className="text-zinc-400 text-sm">from $49</Text>
            </Pressable>

            <Pressable className="bg-zinc-900 flex-1 min-w-[48%] p-5 rounded-3xl border border-zinc-700">
              <IconSymbol name="car.fill" size={32} color="#F97316" />
              <Text className="text-white font-semibold mt-4">Flat Tire</Text>
              <Text className="text-zinc-400 text-sm">from $69</Text>
            </Pressable>

            <Pressable className="bg-zinc-900 flex-1 min-w-[48%] p-5 rounded-3xl border border-zinc-700">
              <IconSymbol name="drop.fill" size={32} color="#F97316" />
              <Text className="text-white font-semibold mt-4">Oil Change</Text>
              <Text className="text-zinc-400 text-sm">from $89</Text>
            </Pressable>

            <Pressable className="bg-zinc-900 flex-1 min-w-[48%] p-5 rounded-3xl border border-zinc-700">
              <IconSymbol name="wrench.fill" size={32} color="#F97316" />
              <Text className="text-white font-semibold mt-4">Diagnostic</Text>
              <Text className="text-zinc-400 text-sm">from $79</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}