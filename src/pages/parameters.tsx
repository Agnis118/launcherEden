import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CogIcon, GamepadIcon, InfoIcon, Package, User } from "lucide-react";
import { useState } from "react";
import AboutParameters from "./params/about";
import AccountParameters from "./params/account";
import MinecraftParameters from "./params/minecraft";
import ModpackParameters from "./params/modpacks";

export default function Parameters() {
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("account");

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="absolute top-4 right-4 p-2 rounded-md hover:bg-secondary/80 transition-colors border-0 bg-transparent text-foreground">
                    <CogIcon className="h-5 w-5" />
                </Button>
            </DialogTrigger>

            <DialogContent className="min-w-[80vw] min-h-[80vh] p-0">
                <div className="flex h-full">
                    {/* Sidebar Navigation */}
                    <div className="w-64 border-r bg-muted/20">
                        <DialogHeader className="p-6 pb-4">
                            <DialogTitle className="text-xl">
                                Paramètres
                            </DialogTitle>
                            <DialogDescription>
                                Configurez votre expérience Phyloria
                            </DialogDescription>
                        </DialogHeader>

                        <Separator />

                        <div className="p-4">
                            <Tabs
                                value={activeTab}
                                onValueChange={setActiveTab}
                                orientation="vertical"
                                className="w-full"
                            >
                                <TabsList className="grid w-full grid-cols-1 h-auto bg-transparent">
                                    <TabsTrigger
                                        value="account"
                                        className="w-full justify-start gap-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                                    >
                                        <User className="h-4 w-4" />
                                        Compte
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="minecraft"
                                        className="w-full justify-start gap-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                                    >
                                        <GamepadIcon className="h-4 w-4" />
                                        Minecraft
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="modpack"
                                        className="w-full justify-start gap-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                                    >
                                        <Package className="h-4 w-4" />
                                        Modpacks
                                    </TabsTrigger>
                                    <TabsTrigger
                                        value="about"
                                        className="w-full justify-start gap-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                                    >
                                        <InfoIcon className="h-4 w-4" />À propos
                                    </TabsTrigger>
                                </TabsList>
                            </Tabs>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-muted/10">
                            <p className="text-center text-xs text-muted-foreground">
                                Phyloria Launcher v1.0
                            </p>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 overflow-y-auto">
                        <Tabs value={activeTab} onValueChange={setActiveTab}>
                            {/* account Tab */}
                            <TabsContent value="account" className="m-0 p-8">
                                <AccountParameters />
                            </TabsContent>

                            {/* Minecraft Tab */}
                            <TabsContent value="minecraft" className="m-0 p-8">
                                <MinecraftParameters />
                            </TabsContent>

                            {/* Modpack Tab */}
                            <TabsContent value="modpack" className="m-0 p-8">
                                <ModpackParameters />
                            </TabsContent>

                            {/* About Tab */}
                            <TabsContent value="about" className="m-0 p-8">
                                <AboutParameters />
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
