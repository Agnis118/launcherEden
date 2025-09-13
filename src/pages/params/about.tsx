import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { InfoIcon } from "lucide-react";

export default function AboutParameters() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <InfoIcon className="h-5 w-5" />À propos de Phyloria
                </CardTitle>
                <CardDescription>
                    Informations sur l&apos;application
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label className="text-sm font-medium">
                                Version
                            </Label>
                            <p className="text-sm text-muted-foreground">
                                1.0.0
                            </p>
                        </div>
                        <div>
                            <Label className="text-sm font-medium">Build</Label>
                            <p className="text-sm text-muted-foreground">
                                2025-09-13
                            </p>
                        </div>
                    </div>

                    <Separator className="my-4" />

                    <div>
                        <Label className="text-sm font-medium">
                            Description
                        </Label>
                        <p className="text-sm text-muted-foreground mt-1">
                            Phyloria Launcher est une application moderne de
                            gestion Minecraft et Modpacks, conçue pour offrir
                            une expérience utilisateur fluide et intuitive.
                        </p>
                    </div>

                    <div>
                        <Label className="text-sm font-medium">
                            Développé par
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            Alpha3608 - Equipe Phyloria
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
